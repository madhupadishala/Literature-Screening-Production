/**
 * agent-2-icsr-duplicates.ts
 *
 * Agent 2: ICSR Duplicates Detection (Literature-style)
 *
 * Detects duplicate literature records for ICSR processing using:
 * - Exact PMID match
 * - Exact DOI match (case-insensitive)
 * - Title similarity (Jaccard on tokenized words)
 * - Author last name + year exact match + title similarity
 * - Chemical overlap Jaccard
 *
 * Compliance: FDA 21 CFR Part 11, EU GVP Module VI, GAMP 5
 */

import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities } from './base-agent';
import { HybridInferenceRouter } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES (from lib/contracts/duplicate-detection.ts)
// ============================================================================

export interface DuplicateRecord {
  id: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  pmidVersion?: number;
  abstract?: string;
  publicationType?: string[];
  source: "pubmed" | "europepmc" | "crossref" | "internal";
  sourceId: string;
  checksum?: string;
}

export interface DuplicateInput {
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  abstract?: string;
}

export interface DuplicateMatch {
  record: DuplicateRecord;
  score: number;
  matchType: "exact" | "high" | "medium" | "low";
  matchedFields: string[];
}

export interface DuplicateDetectionResult {
  duplicates: DuplicateMatch[];
  totalChecked: number;
  processingTimeMs: number;
}

export interface DuplicateDetectionService {
  findDuplicates(input: DuplicateInput): Promise<DuplicateDetectionResult>;
  checkDuplicate(candidate: DuplicateInput, existing: DuplicateRecord[]): Promise<DuplicateMatch | null>;
  batchCheckDuplicates(candidates: DuplicateInput[], existing: DuplicateRecord[]): Promise<DuplicateMatch[]>;
  getStats(): Promise<{
    totalRecords: number;
    totalDuplicatesFound: number;
    lastRun: string;
  }>;
}

// Internal types for the agent
interface Agent2Input {
  candidate: DuplicateInput;
  existingRecords: DuplicateRecord[];
  threshold?: number;
}

interface Agent2Output {
  duplicates: DuplicateMatch[];
  totalChecked: number;
  processingTimeMs: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function titleSimilarity(titleA: string, titleB: string): number {
  const tokensA = new Set(tokenize(titleA));
  const tokensB = new Set(tokenize(titleB));
  return jaccardSimilarity(tokensA, tokensB);
}

function getAuthorLastNames(authors: string[]): string[] {
  return authors
    .map(a => a.trim().split(/\s+/).pop()?.toLowerCase() || '')
    .filter(Boolean);
}

function authorLastNameMatch(authorsA: string[], authorsB: string[]): boolean {
  const lastNamesA = new Set(getAuthorLastNames(authorsA));
  const lastNamesB = new Set(getAuthorLastNames(authorsB));
  for (const name of lastNamesA) {
    if (lastNamesB.has(name)) return true;
  }
  return false;
}

function chemicalOverlap(chemicalsA: string[], chemicalsB: string[]): number {
  if (chemicalsA.length === 0 || chemicalsB.length === 0) return 0;
  const setA = new Set(chemicalsA.map(c => c.toLowerCase()));
  const setB = new Set(chemicalsB.map(c => c.toLowerCase()));
  return jaccardSimilarity(setA, setB);
}

// ============================================================================
// AGENT 2 IMPLEMENTATION
// ============================================================================

export class ICSRDuplicatesAgent extends BaseAgent {
  private readonly defaultThreshold = 0.7;

  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-2-icsr-duplicates',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 30000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-2-icsr-duplicates',
      name: 'ICSR Duplicates Detector (Literature)',
      description: 'Detects duplicate literature records for ICSR processing using PMID, DOI, title, author, and chemical matching heuristics',
      input_schema: {
        type: 'object',
        properties: {
          candidate: { type: 'object' },
          existingRecords: { type: 'array', items: { type: 'object' } },
          threshold: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['candidate', 'existingRecords'],
      },
      output_schema: {
        type: 'object',
        properties: {
          duplicates: { type: 'array' },
          totalChecked: { type: 'integer' },
          processingTimeMs: { type: 'integer' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['redis-zdr-store', 'audit-ledger'],
      estimated_latency_ms: 1000,
      max_concurrent: 20,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent2Input;

    try {
      const { candidate, existingRecords, threshold = this.defaultThreshold } = inputPayload;

      if (!candidate || !existingRecords || existingRecords.length === 0) {
        return this.createResult(true, {
          duplicates: [],
          totalChecked: 0,
          processingTimeMs: Date.now() - startTime,
        }, Date.now() - startTime);
      }

      const duplicates: DuplicateMatch[] = [];

      for (const existing of existingRecords) {
        const match = this.checkDuplicate(candidate, existing);
        if (match) {
          duplicates.push(match);
        }
      }

      // Sort by score descending
      duplicates.sort((a, b) => b.score - a.score);

      const output: Agent2Output = {
        duplicates,
        totalChecked: existingRecords.length,
        processingTimeMs: Date.now() - startTime,
      };

      return this.createResult(true, output, Date.now() - startTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createResult(false, null, Date.now() - startTime, errorMessage);
    }
  }

  /**
   * Check if candidate is a duplicate of a single existing record
   * Implements the 6 heuristic rules (checked in priority order):
   * 1. Exact PMID match → score 1.0, matchType "exact"
   * 2. Exact DOI match (case-insensitive) → score 1.0, matchType "exact"
   * 3. Title similarity (Jaccard) ≥ 0.85 → score = similarity, matchType "high"
   * 4. Author last name + year exact match + title similarity ≥ 0.7 → score = 0.85, matchType "medium"
   *    (Only applies when title similarity is < 0.85, otherwise rule 3 takes precedence)
   * 5. Chemical overlap Jaccard ≥ 0.6 → score = jaccard * 0.8, matchType "medium"
   * 6. Else → no match
   */
  private checkDuplicate(candidate: DuplicateInput, existing: DuplicateRecord): DuplicateMatch | null {
    const matchedFields: string[] = [];

    // Rule 1: Exact PMID match
    if (candidate.pmid && existing.pmid && candidate.pmid === existing.pmid) {
      return {
        record: existing,
        score: 1.0,
        matchType: "exact",
        matchedFields: ["pmid"],
      };
    }

    // Rule 2: Exact DOI match (case-insensitive)
    if (candidate.doi && existing.doi && candidate.doi.toLowerCase() === existing.doi.toLowerCase()) {
      return {
        record: existing,
        score: 1.0,
        matchType: "exact",
        matchedFields: ["doi"],
      };
    }

    // Rule 3: Title similarity (Jaccard) ≥ 0.85
    // Check this first - high title similarity gets "high" match type regardless of author
    if (candidate.title && existing.title) {
      const titleSim = titleSimilarity(candidate.title, existing.title);
      if (titleSim >= 0.85) {
        return {
          record: existing,
          score: titleSim,
          matchType: "high",
          matchedFields: ["title"],
        };
      }
    }

    // Rule 4: Author last name + year exact match + title similarity ≥ 0.7 (but < 0.85)
    // Only applies when title similarity is below 0.85 (otherwise caught by rule 3)
    if (candidate.year && existing.year && candidate.year === existing.year) {
      if (candidate.authors && existing.authors && authorLastNameMatch(candidate.authors, existing.authors)) {
        if (candidate.title && existing.title) {
          const titleSim = titleSimilarity(candidate.title, existing.title);
          if (titleSim >= 0.7 && titleSim < 0.85) {
            return {
              record: existing,
              score: 0.85,
              matchType: "medium",
              matchedFields: ["author_last_name", "year", "title"],
            };
          }
        }
      }
    }

    // Rule 5: Chemical overlap Jaccard ≥ 0.6
    // Note: The contract DuplicateInput doesn't have chemicals field, but existing records might
    // We need to extract chemicals from the candidate/record if available
    const candidateChemicals = this.extractChemicals(candidate);
    const existingChemicals = this.extractChemicals(existing);
    if (candidateChemicals.length > 0 && existingChemicals.length > 0) {
      const chemOverlap = chemicalOverlap(candidateChemicals, existingChemicals);
      if (chemOverlap >= 0.6) {
        return {
          record: existing,
          score: chemOverlap * 0.8,
          matchType: "medium",
          matchedFields: ["chemicals"],
        };
      }
    }

    // Rule 6: No match
    return null;
  }

  /**
   * Extract chemicals from record - tries multiple fields
   */
  private extractChemicals(record: DuplicateInput | DuplicateRecord): string[] {
    // Try to get chemicals from various possible fields
    const chemicals: string[] = [];

    // Check if it's a DuplicateRecord with chemicals (not in DuplicateInput but may exist in existing)
    if ('chemicals' in record && Array.isArray((record as any).chemicals)) {
      chemicals.push(...(record as any).chemicals);
    }

    // Also check mesh_terms or keywords if available
    if ('mesh_terms' in record && Array.isArray((record as any).mesh_terms)) {
      chemicals.push(...(record as any).mesh_terms);
    }
    if ('keywords' in record && Array.isArray((record as any).keywords)) {
      chemicals.push(...(record as any).keywords);
    }

    return chemicals;
  }

  private createResult(success: boolean, output: Agent2Output | null, executionTime: number, error?: string): AgentResult {
    return {
      success,
      agent_id: 'agent-2-icsr-duplicates',
      trace_id: '',
      output,
      error,
      execution_tier: 'LOCAL',
      latency_ms: executionTime,
      merkle_entry_hash: createHash('sha256').update(JSON.stringify({ success, output, executionTime })).digest('hex'),
      execution_metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createICSRDuplicatesAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): ICSRDuplicatesAgent {
  return new ICSRDuplicatesAgent(config);
}