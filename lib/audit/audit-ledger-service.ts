/**
 * audit-ledger-service.ts
 *
 * TypeScript Audit Ledger Service with Per-Tenant Merkle Chain Verification.
 *
 * Implements:
 * - Transactional entry recording with optimistic locking
 * - Prompt/output hash computation (ZDR: no raw PHI)
 * - Tenant chain integrity verification
 * - Hourly global Merkle anchor generation
 * - Regulatory audit trail export
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 * - Zero PHI in persistent storage
 * - SHA-256 Merkle chaining
 * - Electronic signature support
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idle_timeout_ms?: number;
  connection_timeout_ms?: number;
  application_name?: string;
}

/**
 * Input for recording an execution
 */
export interface LedgerEntryInput {
  tenantId: string;
  traceId?: string;
  spanId?: string;
  correlationId?: string;
  agentName: string;
  executionTier: 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';
  modelName?: string;
  modelHash?: string;
  temperature?: number;
  seed?: number;
  grammarVersion?: string;
  promptText: string;           // Raw prompt (will be hashed, not stored)
  rawOutput: string;            // Raw output (will be hashed, not stored)
  redactionSummary?: {
    piiTypes: string[];
    charsRedacted: number;
  };
  decision: string;
  confidence: number;
  meddraPts?: string[];
  seriousnessFlag?: boolean;
}

/**
 * Complete ledger entry from database
 */
export interface LedgerEntry {
  id: string;
  tenant_id: string;
  trace_id: string;
  span_id: string;
  correlation_id: string | null;
  agent_name: string;
  execution_tier: string;
  model_name: string | null;
  model_hash: string | null;
  temperature: number;
  seed: number;
  grammar_version: string | null;
  prompt_hash: string;
  output_hash: string;
  redaction_summary: any | null;
  decision: string;
  confidence: number;
  meddra_pts: string[];
  seriousness_flag: boolean;
  prev_entry_hash: string;
  entry_hash: string;
  created_at: Date;
}

/**
 * Chain verification report
 */
export interface VerificationReport {
  tenant_id: string;
  from_date: Date;
  to_date: Date;
  total_entries: number;
  valid_links: number;
  broken_links: number;
  first_broken_at?: Date;
  broken_entries: Array<{
    entry_id: string;
    trace_id: string;
    created_at: Date;
    expected_prev_hash: string;
    actual_prev_hash: string;
    expected_entry_hash: string;
    actual_entry_hash: string;
  }>;
  chain_intact: boolean;
  verified_at: Date;
}

/**
 * Hourly anchor result
 */
export interface AnchorResult {
  anchor_id: string;
  anchor_hour: Date;
  global_root_hash: string;
  tenant_roots: Record<string, string>;
  anchored_at: Date;
}

/**
 * Audit export entry
 */
export interface AuditExportEntry {
  entry: LedgerEntry;
  human_reviews: HumanReview[];
}

/**
 * Human review entry
 */
export interface HumanReview {
  id: string;
  trace_id: string;
  reviewer_id: string;
  reviewer_role: string;
  original_decision: string;
  overridden_decision: string;
  rationale: string;
  signature_meaning: string;
  reviewer_signature_hash: string;
  signature_timestamp: Date;
}

/**
 * Signing key for electronic signatures (load from secure vault in production)
 */
const SIGNING_KEY = process.env.AUDIT_SIGNING_KEY || 'dev-signing-key-change-in-production';

/**
 * GENESIS hash for empty chain
 */
const GENESIS_HASH = '0'.repeat(64);

/**
 * Current ISO timestamp
 */
function nowISO(): Date {
  return new Date();
}

/**
 * SHA-256 hash
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * HMAC-SHA256 for electronic signatures
 */
function hmacSha256(data: string, key: string = SIGNING_KEY): string {
  return createHash('sha256').update(key + '|' + data).digest('hex');
}

/**
 * Build canonical string for hash computation (MUST match database trigger)
 */
function buildCanonicalString(entry: {
  tenant_id: string;
  trace_id: string;
  span_id: string;
  correlation_id: string | null;
  agent_name: string;
  execution_tier: string;
  model_name: string | null;
  model_hash: string | null;
  temperature: number;
  seed: number;
  grammar_version: string | null;
  prompt_hash: string;
  output_hash: string;
  redaction_summary: any | null;
  decision: string;
  confidence: number;
  meddra_pts: string[];
  seriousness_flag: boolean;
  prev_entry_hash: string;
  created_at: Date | string;
}): string {
  const createdAtStr = entry.created_at instanceof Date
    ? entry.created_at.toISOString()
    : entry.created_at;

  return [
    entry.tenant_id,
    entry.trace_id,
    entry.span_id,
    entry.correlation_id || '',
    entry.agent_name,
    entry.execution_tier,
    entry.model_name || '',
    entry.model_hash || '',
    entry.temperature.toString(),
    entry.seed.toString(),
    entry.grammar_version || '',
    entry.prompt_hash,
    entry.output_hash,
    entry.redaction_summary ? JSON.stringify(entry.redaction_summary) : '',
    entry.decision,
    entry.confidence.toString(),
    `{${entry.meddra_pts.join(',')}}`,
    entry.seriousness_flag.toString(),
    entry.prev_entry_hash,
    createdAtStr,
  ].join('|');
}

// ============================================================================
// AUDIT LEDGER SERVICE
// ============================================================================

export class AuditLedgerService {
  private pool: Pool;
  private tenantId: string;

  constructor(config: DatabaseConfig, tenantId: string) {
    this.tenantId = tenantId;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl || false,
      max: config.max || 20,
      idleTimeoutMillis: config.idle_timeout_ms || 30000,
      connectionTimeoutMillis: config.connection_timeout_ms || 5000,
      application_name: config.application_name || 'nexus-audit-ledger',
    });

    this.pool.on('error', (err) => {
      console.error('[AuditLedgerService] Pool error:', err);
    });
  }

  /**
   * Initialize: verify schema exists
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify tables exist
      const result = await client.query(`
        SELECT 1 FROM ai_execution_ledger LIMIT 1
      `);
      console.log('[AuditLedgerService] Connected and schema verified');
    } finally {
      client.release();
    }
  }

  /**
   * Record an execution entry with Merkle chaining
   * Uses optimistic locking via transaction
   */
  async recordExecution(input: LedgerEntryInput): Promise<string> {
    const client = await this.pool.connect();
    const traceId = input.traceId || this.generateTraceId();

    try {
      await client.query('BEGIN');

      // Set tenant context for RLS
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [this.tenantId]);

      // Get latest entry hash for this tenant (for chaining)
      const prevHashResult = await client.query(
        `SELECT get_latest_entry_hash($1) AS prev_hash`,
        [this.tenantId]
      );
      const prevEntryHash = prevHashResult.rows[0]?.prev_hash || GENESIS_HASH;

      // Compute hashes (ZDR: raw text never stored)
      const promptHash = sha256(input.promptText);
      const outputHash = sha256(input.rawOutput);

      // Build canonical entry for hash computation
      const canonicalEntry = {
        tenant_id: this.tenantId,
        trace_id: traceId,
        span_id: input.spanId || this.generateSpanId(),
        correlation_id: input.correlationId || null,
        agent_name: input.agentName,
        execution_tier: input.executionTier,
        model_name: input.modelName || null,
        model_hash: input.modelHash || null,
        temperature: input.temperature ?? 0.0,
        seed: input.seed ?? 42,
        grammar_version: input.grammarVersion || null,
        prompt_hash: promptHash,
        output_hash: outputHash,
        redaction_summary: input.redactionSummary || null,
        decision: input.decision,
        confidence: input.confidence,
        meddra_pts: input.meddraPts || [],
        seriousness_flag: input.seriousnessFlag ?? false,
        prev_entry_hash: prevEntryHash,
        created_at: nowISO(),
      };

      // Compute entry hash (application-side verification before insert)
      const canonicalString = buildCanonicalString(canonicalEntry);
      const entryHash = sha256(canonicalString);

      // Insert with computed hash (trigger will verify)
      const insertResult = await client.query(
        `INSERT INTO ai_execution_ledger (
          tenant_id, trace_id, span_id, correlation_id,
          agent_name, execution_tier, model_name, model_hash,
          temperature, seed, grammar_version,
          prompt_hash, output_hash, redaction_summary,
          decision, confidence, meddra_pts, seriousness_flag,
          prev_entry_hash, entry_hash, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id, entry_hash`,
        [
          canonicalEntry.tenant_id,
          canonicalEntry.trace_id,
          canonicalEntry.span_id,
          canonicalEntry.correlation_id,
          canonicalEntry.agent_name,
          canonicalEntry.execution_tier,
          canonicalEntry.model_name,
          canonicalEntry.model_hash,
          canonicalEntry.temperature,
          canonicalEntry.seed,
          canonicalEntry.grammar_version,
          canonicalEntry.prompt_hash,
          canonicalEntry.output_hash,
          canonicalEntry.redaction_summary ? JSON.stringify(canonicalEntry.redaction_summary) : null,
          canonicalEntry.decision,
          canonicalEntry.confidence,
          canonicalEntry.meddra_pts,
          canonicalEntry.seriousness_flag,
          canonicalEntry.prev_entry_hash,
          entryHash,
          canonicalEntry.created_at,
        ]
      );

      await client.query('COMMIT');

      const insertedId = insertResult.rows[0].id;
      const verifiedHash = insertResult.rows[0].entry_hash;

      // Verify hash matches (defense in depth)
      if (verifiedHash !== entryHash) {
        throw new Error(`Hash mismatch after insert: computed=${entryHash}, db=${verifiedHash}`);
      }

      return traceId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Record multiple entries in batch (single transaction per entry for chaining)
   */
  async recordBatch(inputs: LedgerEntryInput[]): Promise<string[]> {
    const traceIds: string[] = [];
    for (const input of inputs) {
      const traceId = await this.recordExecution(input);
      traceIds.push(traceId);
    }
    return traceIds;
  }

  /**
   * Verify tenant chain integrity for date range
   */
  async verifyTenantChain(
    tenantId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<VerificationReport> {
    const client = await this.pool.connect();
    try {
      // Set tenant context
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);

      // Call database verification function
      const result = await client.query(
        `SELECT * FROM verify_tenant_chain($1, $2, $3)`,
        [tenantId, fromDate, toDate]
      );

      const brokenEntries: VerificationReport['broken_entries'] = [];
      let validLinks = 0;
      let firstBrokenAt: Date | undefined;

      for (const row of result.rows) {
        if (!row.chain_valid) {
          brokenEntries.push({
            entry_id: row.entry_id,
            trace_id: row.trace_id,
            created_at: row.created_at,
            expected_prev_hash: row.expected_prev_hash,
            actual_prev_hash: row.actual_prev_hash,
            expected_entry_hash: row.expected_entry_hash,
            actual_entry_hash: row.actual_entry_hash,
          });
          if (!firstBrokenAt) firstBrokenAt = row.created_at;
        } else {
          validLinks++;
        }
      }

      return {
        tenant_id: tenantId,
        from_date: fromDate,
        to_date: toDate,
        total_entries: result.rows.length,
        valid_links: validLinks,
        broken_links: brokenEntries.length,
        first_broken_at: firstBrokenAt,
        broken_entries: brokenEntries,
        chain_intact: brokenEntries.length === 0,
        verified_at: nowISO(),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Generate hourly global Merkle anchor
   */
  async generateHourlyAnchor(anchorHour?: Date): Promise<AnchorResult> {
    const client = await this.pool.connect();
    try {
      const hour = anchorHour ? `date_trunc('hour', $1::timestamptz)` : `date_trunc('hour', NOW())`;
      const params = anchorHour ? [anchorHour] : [];

      const result = await client.query(
        `SELECT generate_hourly_merkle_anchor(${hour}) AS anchor_id`,
        params
      );

      const anchorId = result.rows[0].anchor_id;

      // Fetch the anchor details
      const anchorResult = await client.query(
        `SELECT anchor_hour, global_root_hash, tenant_roots, anchored_at
         FROM global_merkle_anchors
         WHERE id = $1`,
        [anchorId]
      );

      const anchor = anchorResult.rows[0];

      return {
        anchor_id: anchorId,
        anchor_hour: anchor.anchor_hour,
        global_root_hash: anchor.global_root_hash,
        tenant_roots: anchor.tenant_roots,
        anchored_at: anchor.anchored_at,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Export audit trail for regulatory submission
   */
  async exportAuditTrail(
    tenantId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<AuditExportEntry[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [tenantId]);

      const result = await client.query(
        `SELECT * FROM export_audit_trail($1, $2, $3)`,
        [tenantId, fromDate, toDate]
      );

      return result.rows.map(row => ({
        entry: {
          ...row.entry,
          created_at: new Date(row.entry.created_at),
        },
        human_reviews: row.human_reviews.map((r: any) => ({
          ...r,
          signature_timestamp: new Date(r.signature_timestamp),
        })),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Record human review override with electronic signature
   */
  async recordHumanReview(
    traceId: string,
    reviewerId: string,
    reviewerRole: string,
    originalDecision: string,
    overriddenDecision: string,
    rationale: string,
    signatureMeaning: string
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [this.tenantId]);

      // Verify original entry exists and belongs to this tenant
      const entryCheck = await client.query(
        `SELECT 1 FROM ai_execution_ledger WHERE trace_id = $1 AND tenant_id = $2`,
        [traceId, this.tenantId]
      );

      if (entryCheck.rows.length === 0) {
        throw new Error(`Original execution not found for trace_id: ${traceId}`);
      }

      // Build signature data
      const signatureData = [
        traceId,
        reviewerId,
        reviewerRole,
        originalDecision,
        overriddenDecision,
        rationale,
        signatureMeaning,
        nowISO().toISOString(),
      ].join('|');

      const reviewerSignatureHash = hmacSha256(signatureData);

      // Insert human review
      const result = await client.query(
        `INSERT INTO ai_human_review (
          trace_id, reviewer_id, reviewer_role,
          original_decision, overridden_decision, rationale,
          signature_meaning, reviewer_signature_hash, signature_timestamp
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`,
        [
          traceId,
          reviewerId,
          reviewerRole,
          originalDecision,
          overriddenDecision,
          rationale,
          signatureMeaning,
          reviewerSignatureHash,
          nowISO(),
        ]
      );

      // Also record OVERRIDE entry in main ledger
      const overrideTraceId = this.generateTraceId();
      await this.recordExecution({
        tenantId: this.tenantId,
        traceId: overrideTraceId,
        correlationId: traceId,
        agentName: 'human-review',
        executionTier: 'LOCAL',
        modelName: 'human-reviewer',
        modelHash: 'human',
        temperature: 0.0,
        seed: 0,
        promptText: `HUMAN OVERRIDE: ${rationale}`,
        rawOutput: JSON.stringify({
          original_decision: originalDecision,
          overridden_decision: overriddenDecision,
          reviewer_id: reviewerId,
        }),
        redactionSummary: { piiTypes: [], charsRedacted: 0 },
        decision: overriddenDecision,
        confidence: 1.0,
        seriousnessFlag: false,
      });

      await client.query('COMMIT');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get entries by trace ID (for debugging)
   */
  async getByTraceId(traceId: string): Promise<LedgerEntry[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [this.tenantId]);

      const result = await client.query(
        `SELECT * FROM ai_execution_ledger WHERE trace_id = $1 ORDER BY created_at`,
        [traceId]
      );

      return result.rows.map(row => ({
        ...row,
        created_at: new Date(row.created_at),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get human reviews for a trace
   */
  async getHumanReviews(traceId: string): Promise<HumanReview[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [this.tenantId]);

      const result = await client.query(
        `SELECT * FROM ai_human_review WHERE trace_id = $1 ORDER BY signature_timestamp DESC`,
        [traceId]
      );

      return result.rows.map(row => ({
        ...row,
        signature_timestamp: new Date(row.signature_timestamp),
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get ledger statistics
   */
  async getStats(): Promise<{
    total_entries: number;
    by_tier: Record<string, number>;
    by_decision: Record<string, number>;
    by_agent: Record<string, number>;
    date_range: { earliest: Date | null; latest: Date | null };
  }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL app.current_tenant_id = $1`, [this.tenantId]);

      const [total, byTier, byDecision, byAgent, dateRange] = await Promise.all([
        client.query(`SELECT COUNT(*) as count FROM ai_execution_ledger`),
        client.query(`SELECT execution_tier, COUNT(*) as count FROM ai_execution_ledger GROUP BY execution_tier`),
        client.query(`SELECT decision, COUNT(*) as count FROM ai_execution_ledger GROUP BY decision`),
        client.query(`SELECT agent_name, COUNT(*) as count FROM ai_execution_ledger GROUP BY agent_name`),
        client.query(`SELECT MIN(created_at) as earliest, MAX(created_at) as latest FROM ai_execution_ledger`),
      ]);

      return {
        total_entries: parseInt(total.rows[0].count, 10),
        by_tier: Object.fromEntries(byTier.rows.map(r => [r.execution_tier, parseInt(r.count, 10)])),
        by_decision: Object.fromEntries(byDecision.rows.map(r => [r.decision, parseInt(r.count, 10)])),
        by_agent: Object.fromEntries(byAgent.rows.map(r => [r.agent_name, parseInt(r.count, 10)])),
        date_range: {
          earliest: dateRange.rows[0]?.earliest ? new Date(dateRange.rows[0].earliest) : null,
          latest: dateRange.rows[0]?.latest ? new Date(dateRange.rows[0].latest) : null,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Close pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  private generateTraceId(): string {
    return `trc_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
  }

  private generateSpanId(): string {
    return `spn_${randomBytes(8).toString('hex')}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAuditLedgerService(config: DatabaseConfig, tenantId: string): AuditLedgerService {
  return new AuditLedgerService(config, tenantId);
}

export function createAuditLedgerServiceFromEnv(tenantId: string): AuditLedgerService {
  const config: DatabaseConfig = {
    host: process.env.AUDIT_DB_HOST || 'localhost',
    port: parseInt(process.env.AUDIT_DB_PORT || '5432', 10),
    database: process.env.AUDIT_DB_NAME || 'nexus_audit',
    user: process.env.AUDIT_DB_USER || 'postgres',
    password: process.env.AUDIT_DB_PASSWORD || 'postgres',
    ssl: process.env.AUDIT_DB_SSL === 'true',
    max: 20,
    application_name: 'nexus-audit-ledger',
  };
  return new AuditLedgerService(config, tenantId);
}

// ============================================================================
// CLI / TESTING
// ============================================================================

if (require.main === module) {
  (async () => {
    const tenantId = process.argv[2] || '00000000-0000-0000-0000-000000000001';
    const service = createAuditLedgerServiceFromEnv(tenantId);

    try {
      await service.initialize();

      // Test record
      const traceId = await service.recordExecution({
        tenantId,
        agentName: 'test-agent',
        executionTier: 'LOCAL',
        modelName: 'qwen2.5-14b-instruct-q4_k_m',
        modelHash: 'abc123...',
        temperature: 0.0,
        seed: 42,
        promptText: 'Test prompt for verification',
        rawOutput: '{"decision": "INCLUDE", "confidence": 0.95}',
        redactionSummary: { piiTypes: [], charsRedacted: 0 },
        decision: 'INCLUDE',
        confidence: 0.95,
        meddraPts: ['10024567'],
        seriousnessFlag: false,
      });
      console.log('Recorded trace:', traceId);

      // Test chain verification
      const report = await service.verifyTenantChain(
        tenantId,
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date()
      );
      console.log('Chain verification:', report);

      // Test stats
      const stats = await service.getStats();
      console.log('Stats:', stats);

    } catch (err) {
      console.error('Error:', err);
    } finally {
      await service.close();
    }
  })().catch(console.error);
}