/**
 * redis-zdr-store.ts
 *
 * Tiered TTL Redis ZDR (Zero Data Retention) Store with Dead-Letter Queue.
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 * - No PHI/PII in persistent storage
 * - Tiered TTL: ingestion=24h, post-slm=7d, audit=30d
 * - Explicit flush on task completion
 * - Dead-Letter Queue for unrecoverable errors
 * - Health checks and observability
 */

import { createClient, RedisClientType } from 'redis';
import { createHash, randomBytes } from 'crypto';

// ============================================================================
// TYPES & CONFIGURATION
// ============================================================================

/**
 * ZDR TTL Tiers (in seconds)
 */
export const ZDR_TTL_TIERS = {
  INGESTION: 24 * 60 * 60,      // 24 hours - raw ingestion data
  POST_SLM: 7 * 24 * 60 * 60,   // 7 days   - SLM output awaiting review
  AUDIT_METADATA: 30 * 24 * 60 * 60, // 30 days - audit metadata only (no PHI)
  DLQ: 90 * 24 * 60 * 60,       // 90 days  - dead letter queue for forensics
} as const;

/**
 * Redis key prefixes for multi-tenancy isolation
 */
export const KEY_PREFIX = {
  INGESTION: 'zdr:ingest',
  POST_SLM: 'zdr:post_slm',
  AUDIT: 'zdr:audit',
  DLQ: 'screening:dlq',
  LOCK: 'zdr:lock',
  HEALTH: 'zdr:health',
} as const;

/**
 * Data classification for ZDR compliance
 */
export type DataClassification = 'PHI' | 'PII' | 'CLINICAL' | 'METADATA' | 'REDACTED';

/**
 * Ingestion payload stored in Redis
 */
export interface IngestionPayload {
  trace_id: string;
  tenant_id: string;
  pmid: string;
  source: 'PUBMED' | 'MAILBOX' | 'MANUAL';
  title: string;
  abstract: string;
  full_text?: string;
  mesh_terms?: string[];
  chemicals?: string[];
  publication_types?: string[];
  language?: string;
  classification: DataClassification;
  created_at: string;           // ISO 8601
  expires_at: string;           // ISO 8601
  pii_redacted: boolean;
  pii_types_found?: string[];   // e.g., ["PERSON", "DATE", "MRN"]
}

/**
 * Post-SLM payload stored in Redis
 */
export interface PostSlmPayload {
  trace_id: string;
  tenant_id: string;
  pmid: string;
  execution_tier: 'CLOUD' | 'LOCAL' | 'HEURISTIC' | 'DLQ';
  model_name: string;
  model_hash: string;
  decision: string;
  confidence: number;
  adverse_events: Array<{
    meddra_llt: string;
    verbatim_text: string;
    seriousness: 'serious' | 'non_serious' | 'unknown';
  }>;
  verbatim_quotes: string[];
  seriousness_flag: boolean;
  special_situations: string[];
  exclusion_criteria: string[];
  classification: DataClassification; // Always 'REDACTED' or 'METADATA'
  created_at: string;
  expires_at: string;
}

/**
 * Dead Letter Queue entry
 */
export interface DLQEntry {
  id: string;
  trace_id: string;
  tenant_id: string;
  pmid: string;
  stage: 'INGESTION' | 'PRODUCT_FILTER' | 'SLM_EXTRACTION' | 'LEDGER_COMMIT' | 'HITL_REVIEW';
  error_code: string;
  error_message: string;
  stack_trace?: string;
  payload_ref: string;          // Redis key of failed payload (for forensics)
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;       // ISO 8601
  created_at: string;
  last_attempt_at: string;
  resolved: boolean;
  resolution?: string;
}

/**
 * Lock for distributed coordination
 */
export interface ZDRLock {
  key: string;
  owner: string;
  acquired_at: string;
  expires_at: string;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number;
  connected: boolean;
  memory_usage_pct?: number;
  key_count?: number;
  dlq_size?: number;
  oldest_dlq_entry?: string;
  checks: {
    ping: boolean;
    write: boolean;
    read: boolean;
    ttl: boolean;
    dlq: boolean;
  };
}

/**
 * ZDR Store Configuration
 */
export interface ZDRStoreConfig {
  url: string;                  // redis://host:port or rediss:// for TLS
  tenant_id: string;            // Tenant identifier for key prefixing
  default_ttl_tier: keyof typeof ZDR_TTL_TIERS;
  max_retries: number;          // DLQ max retries
  retry_backoff_base_ms: number;
  retry_backoff_max_ms: number;
  health_check_interval_ms: number;
  enable_tls: boolean;
  connection_timeout_ms: number;
  command_timeout_ms: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate tenant-scoped Redis key
 */
function tenantKey(prefix: string, tenantId: string, ...parts: string[]): string {
  return `${prefix}:${tenantId}:${parts.join(':')}`;
}

/**
 * Generate unique trace ID
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `trc_${timestamp}_${random}`;
}

/**
 * Current ISO timestamp
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * ISO timestamp from seconds in future
 */
function futureISO(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * SHA-256 hash for integrity
 */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Redact PII from text using regex patterns (fast, deterministic)
 * In production, integrate with Presidio or similar
 */
export function redactPII(text: string): { redacted: string; typesFound: string[] } {
  const patterns: Array<{ type: string; regex: RegExp; replacement: string }> = [
    { type: 'PERSON', regex: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, replacement: '[REDACTED_PERSON]' },
    { type: 'DATE', regex: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, replacement: '[REDACTED_DATE]' },
    { type: 'MRN', regex: /\b(MRN|MR|medical record)[\s:]*\d{6,12}\b/gi, replacement: '[REDACTED_MRN]' },
    { type: 'PHONE', regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
    { type: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
    { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
    { type: 'DOB', regex: /\b(?:DOB|date of birth)[\s:]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi, replacement: '[REDACTED_DOB]' },
    { type: 'AGE', regex: /\b(?:age|aged)[\s:]*\d{1,3}\b/gi, replacement: '[REDACTED_AGE]' },
  ];

  let redacted = text;
  const typesFound: string[] = [];

  for (const { type, regex, replacement } of patterns) {
    if (regex.test(redacted)) {
      typesFound.push(type);
      redacted = redacted.replace(regex, replacement);
    }
  }

  return { redacted, typesFound };
}

/**
 * Validate payload has no PHI (defense in depth)
 */
export function assertNoPHI(payload: any, path: string = 'root'): void {
  const phiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,           // SSN
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
    /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, // Phone
  ];

  const check = (obj: any, currentPath: string): void => {
    if (typeof obj === 'string') {
      for (const pattern of phiPatterns) {
        if (pattern.test(obj)) {
          throw new Error(`PHI detected at ${currentPath}: ${obj.slice(0, 50)}...`);
        }
      }
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        check(value, `${currentPath}.${key}`);
      }
    }
  };

  check(payload, path);
}

// ============================================================================
// ZDR STORE CLASS
// ============================================================================

export class ZDRStore {
  private client: RedisClientType<any, any, any>;
  private config: ZDRStoreConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private isConnected = false;

  constructor(config: ZDRStoreConfig) {
    this.config = config;
    this.client = createClient({
      url: config.url,
      socket: {
        connectTimeout: config.connection_timeout_ms,
        reconnectStrategy: (retries) => {
          if (retries > 10) return new Error('Max retries reached');
          return Math.min(retries * 100, 3000);
        },
      },
    });

    this.client.on('error', (err) => {
      console.error('[ZDRStore] Redis error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      this.isConnected = true;
    });
  }

  /**
   * Connect and start health checks
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
    this.startHealthChecks();
  }

  /**
   * Disconnect and stop health checks
   */
  async disconnect(): Promise<void> {
    this.stopHealthChecks();
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // ========================================================================
  // INGESTION TIER (24h TTL)
  // ========================================================================

  /**
   * Store ingestion payload with PII redaction
   */
  async storeIngestion(
    traceId: string,
    payload: Omit<IngestionPayload, 'trace_id' | 'created_at' | 'expires_at' | 'pii_redacted' | 'pii_types_found'>
  ): Promise<IngestionPayload> {
    // Redact PII from text fields
    const titleRedacted = redactPII(payload.title);
    const abstractRedacted = redactPII(payload.abstract);
    const fullTextRedacted = payload.full_text ? redactPII(payload.full_text) : { redacted: '', typesFound: [] };

    const allTypes = new Set([
      ...titleRedacted.typesFound,
      ...abstractRedacted.typesFound,
      ...fullTextRedacted.typesFound,
    ]);

    const now = nowISO();
    const expiresAt = futureISO(ZDR_TTL_TIERS.INGESTION);

    const ingestionPayload: IngestionPayload = {
      trace_id: traceId,
      ...payload,
      title: titleRedacted.redacted,
      abstract: abstractRedacted.redacted,
      full_text: payload.full_text ? fullTextRedacted.redacted : undefined,
      classification: allTypes.size > 0 ? 'REDACTED' : payload.classification,
      created_at: now,
      expires_at: expiresAt,
      pii_redacted: allTypes.size > 0,
      pii_types_found: Array.from(allTypes),
    };

    // Defense in depth: assert no PHI in final payload
    assertNoPHI(ingestionPayload);

    const key = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, traceId);
    const ttl = ZDR_TTL_TIERS.INGESTION;

    await this.client.setEx(key, ttl, JSON.stringify(ingestionPayload));

    // Index by PMID for lookup
    const pmidIndexKey = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, 'pmid_index', payload.pmid);
    await this.client.setEx(pmidIndexKey, ttl, traceId);

    return ingestionPayload;
  }

  /**
   * Get ingestion payload by trace ID
   */
  async getIngestion(traceId: string): Promise<IngestionPayload | null> {
    const key = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, traceId);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get ingestion payload by PMID
   */
  async getIngestionByPMID(pmid: string): Promise<IngestionPayload | null> {
    const indexKey = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, 'pmid_index', pmid);
    const traceId = await this.client.get(indexKey);
    if (!traceId) return null;
    return this.getIngestion(traceId);
  }

  /**
   * Delete ingestion payload (explicit flush on completion)
   */
  async flushIngestion(traceId: string): Promise<boolean> {
    const key = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, traceId);
    const indexKey = tenantKey(KEY_PREFIX.INGESTION, this.config.tenant_id, 'pmid_index', '*'); // Note: would need SCAN in production
    const deleted = await this.client.del(key);
    return deleted > 0;
  }

  // ========================================================================
  // POST-SLM TIER (7d TTL)
  // ========================================================================

  /**
   * Store post-SLM payload
   */
  async storePostSlm(
    traceId: string,
    payload: Omit<PostSlmPayload, 'trace_id' | 'created_at' | 'expires_at'>
  ): Promise<PostSlmPayload> {
    // Ensure no PHI in SLM output
    assertNoPHI(payload);

    const now = nowISO();
    const expiresAt = futureISO(ZDR_TTL_TIERS.POST_SLM);

    const postSlmPayload: PostSlmPayload = {
      trace_id: traceId,
      ...payload,
      classification: 'REDACTED',
      created_at: now,
      expires_at: expiresAt,
    };

    const key = tenantKey(KEY_PREFIX.POST_SLM, this.config.tenant_id, traceId);
    const ttl = ZDR_TTL_TIERS.POST_SLM;

    await this.client.setEx(key, ttl, JSON.stringify(postSlmPayload));

    // Index for review queue
    const reviewQueueKey = tenantKey(KEY_PREFIX.POST_SLM, this.config.tenant_id, 'review_queue');
    await this.client.lPush(reviewQueueKey, traceId);
    await this.client.expire(reviewQueueKey, ttl);

    return postSlmPayload;
  }

  /**
   * Get post-SLM payload
   */
  async getPostSlm(traceId: string): Promise<PostSlmPayload | null> {
    const key = tenantKey(KEY_PREFIX.POST_SLM, this.config.tenant_id, traceId);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Pop next item from review queue (for HITL workers)
   */
  async popReviewQueue(): Promise<string | null> {
    const reviewQueueKey = tenantKey(KEY_PREFIX.POST_SLM, this.config.tenant_id, 'review_queue');
    const traceId = await this.client.rPop(reviewQueueKey);
    return traceId;
  }

  /**
   * Delete post-SLM payload (flush on review completion)
   */
  async flushPostSlm(traceId: string): Promise<boolean> {
    const key = tenantKey(KEY_PREFIX.POST_SLM, this.config.tenant_id, traceId);
    const deleted = await this.client.del(key);
    return deleted > 0;
  }

  // ========================================================================
  // AUDIT METADATA TIER (30d TTL) - No PHI, only hashes and metadata
  // ========================================================================

  /**
   * Store audit metadata (hashes only, zero PHI)
   */
  async storeAuditMetadata(
    traceId: string,
    metadata: {
      prompt_hash: string;
      output_hash: string;
      entry_hash: string;
      previous_hash: string;
      signature_hash: string;
      execution_tier: string;
      decision: string;
      confidence: number;
      latency_ms: number;
    }
  ): Promise<void> {
    const key = tenantKey(KEY_PREFIX.AUDIT, this.config.tenant_id, traceId);
    const ttl = ZDR_TTL_TIERS.AUDIT_METADATA;

    const auditData = {
      trace_id: traceId,
      ...metadata,
      created_at: nowISO(),
      expires_at: futureISO(ttl),
    };

    await this.client.setEx(key, ttl, JSON.stringify(auditData));
  }

  // ========================================================================
  // DEAD LETTER QUEUE (90d TTL)
  // ========================================================================

  /**
   * Add entry to DLQ
   */
  async addToDLQ(
    traceId: string,
    stage: DLQEntry['stage'],
    errorCode: string,
    errorMessage: string,
    payloadRef: string,
    stackTrace?: string
  ): Promise<DLQEntry> {
    const now = nowISO();
    const id = `dlq_${generateTraceId()}`;

    const entry: DLQEntry = {
      id,
      trace_id: traceId,
      tenant_id: this.config.tenant_id,
      pmid: '', // Would be populated from payload ref
      stage,
      error_code: errorCode,
      error_message: errorMessage,
      stack_trace: stackTrace,
      payload_ref: payloadRef,
      retry_count: 0,
      max_retries: this.config.max_retries,
      created_at: now,
      last_attempt_at: now,
      resolved: false,
    };

    const key = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, id);
    await this.client.setEx(key, ZDR_TTL_TIERS.DLQ, JSON.stringify(entry));

    // Add to DLQ index for monitoring
    const indexKey = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, 'index');
    await this.client.lPush(indexKey, id);
    await this.client.expire(indexKey, ZDR_TTL_TIERS.DLQ);

    return entry;
  }

  /**
   * Get DLQ entry
   */
  async getDLQEntry(id: string): Promise<DLQEntry | null> {
    const key = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, id);
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Retry DLQ entry (increment retry count, schedule next retry)
   */
  async retryDLQEntry(id: string): Promise<DLQEntry | null> {
    const entry = await this.getDLQEntry(id);
    if (!entry || entry.resolved) return null;

    if (entry.retry_count >= entry.max_retries) {
      entry.resolved = true;
      entry.resolution = 'MAX_RETRIES_EXCEEDED';
      await this.updateDLQEntry(id, entry);
      return entry;
    }

    entry.retry_count++;
    entry.last_attempt_at = nowISO();
    // Exponential backoff
    const backoff = Math.min(
      this.config.retry_backoff_base_ms * Math.pow(2, entry.retry_count - 1),
      this.config.retry_backoff_max_ms
    );
    entry.next_retry_at = futureISO(Math.ceil(backoff / 1000));

    await this.updateDLQEntry(id, entry);
    return entry;
  }

  /**
   * Mark DLQ entry as resolved
   */
  async resolveDLQEntry(id: string, resolution: string): Promise<boolean> {
    const entry = await this.getDLQEntry(id);
    if (!entry) return false;

    entry.resolved = true;
    entry.resolution = resolution;
    entry.last_attempt_at = nowISO();

    await this.updateDLQEntry(id, entry);
    return true;
  }

  private async updateDLQEntry(id: string, entry: DLQEntry): Promise<void> {
    const key = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, id);
    const ttl = ZDR_TTL_TIERS.DLQ;
    await this.client.setEx(key, ttl, JSON.stringify(entry));
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats(): Promise<{
    total: number;
    pending: number;
    resolved: number;
    byStage: Record<string, number>;
    oldestEntry?: string;
  }> {
    const indexKey = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, 'index');
    const ids = await this.client.lRange(indexKey, 0, -1);

    let total = 0, pending = 0, resolved = 0;
    const byStage: Record<string, number> = {};
    let oldestEntry: string | undefined;

    for (const id of ids) {
      const entry = await this.getDLQEntry(id);
      if (entry) {
        total++;
        if (entry.resolved) resolved++; else pending++;
        byStage[entry.stage] = (byStage[entry.stage] || 0) + 1;
        if (!oldestEntry || entry.created_at < oldestEntry) {
          oldestEntry = entry.created_at;
        }
      }
    }

    return { total, pending, resolved, byStage, oldestEntry };
  }

  // ========================================================================
  // DISTRIBUTED LOCKING
  // ========================================================================

  /**
   * Acquire distributed lock
   */
  async acquireLock(resource: string, owner: string, ttlSeconds: number = 30): Promise<ZDRLock | null> {
    const key = tenantKey(KEY_PREFIX.LOCK, this.config.tenant_id, resource);
    const lockValue = JSON.stringify({ owner, acquired_at: nowISO() });

    const acquired = await this.client.set(key, lockValue, {
      EX: ttlSeconds,
      NX: true, // Only set if not exists
    });

    if (!acquired) return null;

    return {
      key,
      owner,
      acquired_at: nowISO(),
      expires_at: futureISO(ttlSeconds),
    };
  }

  /**
   * Release distributed lock
   */
  async releaseLock(lock: ZDRLock, owner: string): Promise<boolean> {
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, { keys: [lock.key], arguments: [JSON.stringify({ owner, acquired_at: lock.acquired_at })] });
    return result === 1;
  }

  // ========================================================================
  // HEALTH CHECKS
  // ========================================================================

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch (err) {
        console.error('[ZDRStore] Health check failed:', err);
      }
    }, this.config.health_check_interval_ms);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Comprehensive health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    const checks = { ping: false, write: false, read: false, ttl: false, dlq: false };

    try {
      // Ping
      await this.client.ping();
      checks.ping = true;

      // Write/Read test
      const testKey = tenantKey(KEY_PREFIX.HEALTH, this.config.tenant_id, 'test');
      const testValue = { test: true, timestamp: Date.now() };
      await this.client.setEx(testKey, 10, JSON.stringify(testValue));
      checks.write = true;

      const readValue = await this.client.get(testKey);
      checks.read = readValue !== null;

      // TTL test
      const ttl = await this.client.ttl(testKey);
      checks.ttl = ttl > 0 && ttl <= 10;

      // DLQ check
      const dlqIndexKey = tenantKey(KEY_PREFIX.DLQ, this.config.tenant_id, 'index');
      const dlqSize = await this.client.lLen(dlqIndexKey);
      checks.dlq = true;

      // Memory info
      const info = await this.client.info('memory');
      const usedMatch = info.match(/used_memory_human:(\S+)/);
      const peakMatch = info.match(/used_memory_peak_human:(\S+)/);

      const latencyMs = Date.now() - start;

      return {
        status: Object.values(checks).every(c => c) ? 'healthy' : 'degraded',
        latency_ms: latencyMs,
        connected: this.isConnected,
        memory_usage_pct: undefined, // Would need maxmemory to calculate
        key_count: undefined, // Would need DBSIZE
        dlq_size: dlqSize,
        oldest_dlq_entry: undefined, // Would need to scan
        checks,
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        latency_ms: Date.now() - start,
        connected: false,
        checks: { ping: false, write: false, read: false, ttl: false, dlq: false },
      };
    }
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): RedisClientType<any, any, any> {
    return this.client;
  }
}

// ============================================================================
// FACTORY & DEFAULT CONFIG
// ============================================================================

export function createZDRStore(tenantId: string, overrides?: Partial<ZDRStoreConfig>): ZDRStore {
  const config: ZDRStoreConfig = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    tenant_id: tenantId,
    default_ttl_tier: 'INGESTION',
    max_retries: 3,
    retry_backoff_base_ms: 1000,
    retry_backoff_max_ms: 60000,
    health_check_interval_ms: 30000,
    enable_tls: process.env.REDIS_TLS === 'true',
    connection_timeout_ms: 5000,
    command_timeout_ms: 3000,
    ...overrides,
  };

  return new ZDRStore(config);
}

// ============================================================================
// CLI / STANDALONE TESTING
// ============================================================================

if (require.main === module) {
  (async () => {
    const tenantId = process.argv[2] || 'test-tenant';
    const store = createZDRStore(tenantId);

    try {
      await store.connect();
      console.log('Connected to Redis');

      const health = await store.healthCheck();
      console.log('Health:', JSON.stringify(health, null, 2));

      // Test ingestion
      const traceId = generateTraceId();
      const ingestion = await store.storeIngestion(traceId, {
        tenant_id: tenantId,
        pmid: '12345678',
        source: 'PUBMED',
        title: 'Study of DrugX in patient John Doe',
        abstract: 'Patient John Doe (DOB 01/15/1980) experienced adverse reaction to DrugX.',
        classification: 'CLINICAL',
      });
      console.log('Stored ingestion:', ingestion.trace_id);

      const retrieved = await store.getIngestion(traceId);
      console.log('Retrieved:', retrieved?.title);

      // Test flush
      await store.flushIngestion(traceId);
      console.log('Flushed ingestion');

      const afterFlush = await store.getIngestion(traceId);
      console.log('After flush:', afterFlush);

      // Test DLQ
      const dlqEntry = await store.addToDLQ(
        traceId,
        'SLM_EXTRACTION',
        'SCHEMA_MISMATCH',
        'Invalid JSON output from model',
        `zdr:ingest:${tenantId}:${traceId}`
      );
      console.log('DLQ entry:', dlqEntry.id);

      const stats = await store.getDLQStats();
      console.log('DLQ stats:', stats);

    } catch (err) {
      console.error('Error:', err);
    } finally {
      await store.disconnect();
    }
  })().catch(console.error);
}