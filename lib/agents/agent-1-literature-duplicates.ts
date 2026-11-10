import { BaseAgent, AgentExecutionInput, AgentResult, AgentCapabilities, AgentMessage, generateUUID, generateTraceId, generateSpanId, nowISO, sha256 } from './base-agent';
import { HybridInferenceRouter, InferenceRequest, InferenceResponse, InferenceTier } from '../infrastructure/hybrid-inference-router';
import { AuditLedgerService, LedgerEntryInput } from '../audit/audit-ledger-service';
import { ZDRStore } from '../infrastructure/redis-zdr-store';
import { createHash } from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Literature record for deduplication
 */
export interface LiteratureRecord {
  pmid?: string;
  doi?: string;
  title: string;
  abstract: string;
  authors: string[];
  journal?: string;
  publication_date?: string;
  publication_year?: number;
  mesh_terms?: string[];
  chemicals?: string[];
  keywords?: string[];
  source: 'PUBMED' | 'EMBASE' | 'LOCAL' | 'OTHER';
  source_id: string;
}

/**
 * Duplicate match result
 */
export interface DuplicateMatch {
  record_a: LiteratureRecord;
  record_b: LiteratureRecord;
  similarity_score: number;
  match_type: 'exact_pmid' | 'exact_doi' | 'title_similarity' | 'author_year_fuzzy' | 'chemical_overlap';
  confidence: number;
  matched_fields: string[];
}

/**
 * Duplicate cluster
 */
export interface DuplicateCluster {
  cluster_id: string;
  records: LiteratureRecord[];
  canonical_record: LiteratureRecord;
  pairwise_matches: DuplicateMatch[];
  cluster_confidence: number;
  cluster_size: number;
}

/**
 * Agent 1 input payload
 */
export interface Agent1Input {
  records: LiteratureRecord[];
  similarity_threshold?: number;
  enable_fuzzy_matching?: boolean;
  batch_id?: string;
}

/**
 * Agent 1 output payload
 */
export interface Agent1Output {
  clusters: DuplicateCluster[];
  total_records: number;
  duplicate_count: number;
  unique_count: number;
  processing_stats: {
    exact_pmid_matches: number;
    exact_doi_matches: number;
    title_similarity_matches: number;
    author_year_fuzzy_matches: number;
    chemical_overlap_matches: number;
    processing_time_ms: number;
  };
}

// ============================================================================
// SIMILARITY UTILITIES
// ============================================================================

class SimHash {
  private static readonly HASH_BITS = 64;

  static compute(text: string): bigint {
    const tokens = this.tokenize(text.toLowerCase());
    const hash = Array(this.HASH_BITS).fill(0);

    for (const token of tokens) {
      const tokenHash = this.hashToken(token);
      for (let i = 0; i < this.HASH_BITS; i++) {
        if ((tokenHash >> BigInt(i)) & 1n) {
          hash[i] += 1;
        } else {
          hash[i] -= 1;
        }
      }
    }

    let fingerprint = 0n;
    for (let i = 0; i < this.HASH_BITS; i++) {
      if (hash[i] > 0) {
        fingerprint |= (1n << BigInt(i));
      }
    }
    return fingerprint;
  }

  static similarity(hashA: bigint, hashB: bigint): number {
    const xor = hashA ^ hashB;
    let distance = 0;
    let temp = xor;
    while (temp > 0n) {
      distance += Number(temp & 1n);
      temp >>= 1n;
    }
    return 1 - distance / this.HASH_BITS;
  }

  private static tokenize(text: string): string[] {
    return text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3);
  }

  private static hashToken(token: string): bigint {
    let hash = 0n;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5n) - hash) + BigInt(token.charCodeAt(i));
      hash |= 0n;
    }
    return hash;
  }
}

class MinHash {
  private readonly numHashes: number;
  private readonly seeds: number[];

  constructor(numHashes: number = 128) {
    this.numHashes = numHashes;
    this.seeds = Array.from({ length: numHashes }, (_, i) => i * 31 + 17);
  }

  getSignature(tokens: string[]): number[] {
    if (!tokens || tokens.length === 0) {
      return new Array(this.numHashes).fill(0);
    }
    const signature = new Array(this.numHashes).fill(Infinity);
    for (const token of tokens) {
      const tokenHash = this.hashToken(token);
      for (let i = 0; i < this.numHashes; i++) {
        const hash = this.mix(tokenHash, this.seeds[i]);
        if (hash < signature[i]) signature[i] = hash;
      }
    }
    return signature;
  }

  static jaccardSimilarity(sigA: number[], sigB: number[]): number {
    if (!sigA || !sigB || sigA.length !== sigB.length) return 0;
    let matches = 0;
    for (let i = 0; i < sigA.length; i++) {
      if (sigA[i] === sigB[i]) matches++;
    }
    return matches / sigA.length;
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private mix(hash: number, seed: number): number {
    let h = hash ^ seed;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h ^= h >>> 16;
    return h >>> 0;
  }
}

// ============================================================================
// AGENT 1 IMPLEMENTATION
// ============================================================================

export class LiteratureDuplicatesAgent extends BaseAgent {
  private readonly minSimilarityThreshold = 0.85;
  private readonly simHash = new SimHash();
  private readonly minHash = new MinHash(128);

  constructor(config: {
    tenant_id: string;
    inference_router: HybridInferenceRouter;
    audit_ledger: AuditLedgerService;
    zdr_store: ZDRStore;
  }) {
    super({
      agent_id: 'agent-1-literature-duplicates',
      tenant_id: config.tenant_id,
      inference_router: config.inference_router,
      audit_ledger: config.audit_ledger,
      zdr_store: config.zdr_store,
      max_retries: 2,
      timeout_ms: 60000,
      enable_audit: true,
      deterministic_seed: 42,
    });
  }

  getCapabilities(): AgentCapabilities {
    return {
      agent_id: 'agent-1-literature-duplicates',
      name: 'Literature Duplicates Detector',
      description: 'Detects duplicate literature records across PubMed, Embase, and local databases using SimHash, MinHash, and exact matching',
      input_schema: {
        type: 'object',
        properties: {
          records: { type: 'array', items: { type: 'object' } },
          similarity_threshold: { type: 'number', minimum: 0, maximum: 1 },
          enable_fuzzy_matching: { type: 'boolean' },
          batch_id: { type: 'string' },
        },
        required: ['records'],
      },
      output_schema: {
        type: 'object',
        properties: {
          clusters: { type: 'array' },
          total_records: { type: 'integer' },
          duplicate_count: { type: 'integer' },
          unique_count: { type: 'integer' },
        },
      },
      supported_tiers: ['LOCAL', 'HEURISTIC'],
      required_services: ['redis-zdr-store', 'audit-ledger'],
      estimated_latency_ms: 5000,
      max_concurrent: 10,
    };
  }

  async execute(input: AgentExecutionInput): Promise<AgentResult> {
    const startTime = Date.now();
    const inputPayload = input.payload as Agent1Input;

    try {
      const threshold = inputPayload.similarity_threshold ?? this.minSimilarityThreshold;
      const enableFuzzy = inputPayload.enable_fuzzy_matching ?? true;
      let records = inputPayload.records as LiteratureRecord[];

      if (!records || records.length === 0) {
        const executionTime = Date.now() - startTime;
        return this.createResult(true, { clusters: [], total_records: 0, duplicate_count: 0, unique_count: 0, processing_stats: this.emptyStats() }, executionTime);
      }

      records = records.map(r => ({
        ...r,
        pmid: r.pmid ?? undefined,
        doi: r.doi ?? undefined,
        title: r.title ?? '',
        abstract: r.abstract ?? '',
        authors: r.authors ?? [],
        journal: r.journal ?? undefined,
        publication_date: r.publication_date ?? undefined,
        publication_year: r.publication_year ?? undefined,
        mesh_terms: r.mesh_terms ?? [],
        chemicals: r.chemicals ?? [],
        keywords: r.keywords ?? [],
        source: r.source ?? 'OTHER',
        source_id: r.source_id ?? '',
      }));

      const exactMatches = this.findExactMatches(records);

      const matchedPairs = new Set<string>();
      for (const match of exactMatches) {
        const pairKey = [match.record_a.source_id, match.record_b.source_id].sort().join('|');
        matchedPairs.add(pairKey);
      }

      let chemicalMatches: DuplicateMatch[] = [];
      if (enableFuzzy) {
        const chemicalMatchesRaw = this.findChemicalOverlapMatches(records, threshold);
        chemicalMatches = chemicalMatchesRaw.filter(m => {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          return !matchedPairs.has(pairKey);
        });
        for (const m of chemicalMatches) {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          matchedPairs.add(pairKey);
        }
      }

      let simHashMatches: DuplicateMatch[] = [];
      if (enableFuzzy) {
        const simHashMatchesRaw = this.findSimHashMatches(records, threshold);
        simHashMatches = simHashMatchesRaw.filter(m => {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          return !matchedPairs.has(pairKey);
        });
        for (const m of simHashMatches) {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          matchedPairs.add(pairKey);
        }
      }

      let minHashMatches: DuplicateMatch[] = [];
      if (enableFuzzy) {
        const minHashMatchesRaw = this.findMinHashMatches(records, threshold);
        minHashMatches = minHashMatchesRaw.filter(m => {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          return !matchedPairs.has(pairKey);
        });
        for (const m of minHashMatches) {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          matchedPairs.add(pairKey);
        }
      }

      let authorYearMatches: DuplicateMatch[] = [];
      if (enableFuzzy) {
        const authorYearMatchesRaw = this.findAuthorYearMatches(records, 0.8);
        authorYearMatches = authorYearMatchesRaw.filter(m => {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          return !matchedPairs.has(pairKey);
        });
        for (const m of authorYearMatches) {
          const pairKey = [m.record_a.source_id, m.record_b.source_id].sort().join('|');
          matchedPairs.add(pairKey);
        }
      }

      const allMatches = [
        ...exactMatches,
        ...chemicalMatches,
        ...simHashMatches,
        ...minHashMatches,
        ...authorYearMatches,
      ];

      const clusters = this.buildClusters(records, allMatches);

      const executionTime = Date.now() - startTime;

      const output: Agent1Output = {
        clusters,
        total_records: records.length,
        duplicate_count: records.length - clusters.length,
        unique_count: clusters.length,
        processing_stats: {
          exact_pmid_matches: exactMatches.filter(m => m.match_type === 'exact_pmid').length,
          exact_doi_matches: exactMatches.filter(m => m.match_type === 'exact_doi').length,
          title_similarity_matches: minHashMatches.length + simHashMatches.length,
          author_year_fuzzy_matches: authorYearMatches.length,
          chemical_overlap_matches: chemicalMatches.length,
          processing_time_ms: executionTime,
        },
      };

      return this.createResult(true, output, executionTime);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const executionTime = Date.now() - startTime;
      return this.createResult(false, null, executionTime, errorMessage);
    }
  }

  private findExactMatches(records: LiteratureRecord[]): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    const pmidIndex = new Map<string, LiteratureRecord>();
    const doiIndex = new Map<string, LiteratureRecord>();

    for (const record of records) {
      if (record.pmid) {
        const existing = pmidIndex.get(record.pmid);
        if (existing) {
          matches.push({
            record_a: existing,
            record_b: record,
            similarity_score: 1.0,
            match_type: 'exact_pmid',
            confidence: 1.0,
            matched_fields: ['pmid'],
          });
        } else {
          pmidIndex.set(record.pmid, record);
        }
      }

      if (record.doi) {
        const existing = doiIndex.get(record.doi.toLowerCase());
        if (existing) {
          matches.push({
            record_a: existing,
            record_b: record,
            similarity_score: 1.0,
            match_type: 'exact_doi',
            confidence: 1.0,
            matched_fields: ['doi'],
          });
        } else {
          doiIndex.set(record.doi.toLowerCase(), record);
        }
      }
    }

    return matches;
  }

  private findSimHashMatches(records: LiteratureRecord[], threshold: number): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    const fingerprints = new Map<string, bigint>();

    for (const record of records) {
      const text = `${record.title} ${record.abstract}`;
      const fingerprint = SimHash.compute(text);
      fingerprints.set(record.source_id, fingerprint);
    }

    const recordArray = Array.from(fingerprints.entries());
    for (let i = 0; i < recordArray.length; i++) {
      for (let j = i + 1; j < recordArray.length; j++) {
        const [idA, hashA] = recordArray[i];
        const [idB, hashB] = recordArray[j];
        const similarity = SimHash.similarity(hashA, hashB);

        if (similarity >= threshold) {
          const recordA = records.find(r => r.source_id === idA);
          const recordB = records.find(r => r.source_id === idB);
          if (recordA && recordB) {
            matches.push({
              record_a: recordA,
              record_b: recordB,
              similarity_score: similarity,
              match_type: 'title_similarity',
              confidence: similarity,
              matched_fields: ['simhash_title_abstract'],
            });
          }
        }
      }
    }

    return matches;
  }

  private findMinHashMatches(records: LiteratureRecord[], threshold: number): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    const signatures = new Map<string, number[]>();

    for (const record of records) {
      const tokens = this.tokenize(`${record.title} ${record.abstract}`);
      signatures.set(record.source_id, this.minHash.getSignature(tokens));
    }

    const recordArray = Array.from(signatures.entries());
    for (let i = 0; i < recordArray.length; i++) {
      for (let j = i + 1; j < recordArray.length; j++) {
        const [idA, sigA] = recordArray[i];
        const [idB, sigB] = recordArray[j];
        const similarity = MinHash.jaccardSimilarity(sigA, sigB);

        if (similarity >= threshold) {
          const recordA = records.find(r => r.source_id === idA);
          const recordB = records.find(r => r.source_id === idB);
          if (recordA && recordB) {
            matches.push({
              record_a: recordA,
              record_b: recordB,
              similarity_score: similarity,
              match_type: 'title_similarity',
              confidence: similarity,
              matched_fields: ['minhash_title_abstract'],
            });
          }
        }
      }
    }

    return matches;
  }

  private findAuthorYearMatches(records: LiteratureRecord[], threshold: number): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i];
        const b = records[j];

        const yearA = a.publication_year || this.extractYear(a.publication_date);
        const yearB = b.publication_year || this.extractYear(b.publication_date);
        if (!yearA || !yearB || yearA !== yearB) continue;

        const authorA = a.authors[0]?.split(' ').pop()?.toLowerCase() || '';
        const authorB = b.authors[0]?.split(' ').pop()?.toLowerCase() || '';
        if (!authorA || !authorB || authorA !== authorB) continue;

        const titleSim = this.stringSimilarity(a.title, b.title);
        if (titleSim < 0.7) continue;

        matches.push({
          record_a: a,
          record_b: b,
          similarity_score: (titleSim + 1.0) / 2,
          match_type: 'author_year_fuzzy',
          confidence: titleSim * 0.9,
          matched_fields: ['author_last_name', 'publication_year', 'title'],
        });
      }
    }

    return matches;
  }

  private findChemicalOverlapMatches(records: LiteratureRecord[], threshold: number): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i];
        const b = records[j];

        const chemicalsA = new Set((a.chemicals || []).map(c => c.toLowerCase()));
        const chemicalsB = new Set((b.chemicals || []).map(c => c.toLowerCase()));

        if (chemicalsA.size === 0 || chemicalsB.size === 0) continue;

        const intersection = new Set([...chemicalsA].filter(x => chemicalsB.has(x)));
        const union = new Set([...chemicalsA, ...chemicalsB]);
        const jaccard = intersection.size / union.size;

        if (jaccard >= threshold) {
          // Boost confidence for chemical matches as they're more reliable identifiers
          const confidence = Math.min(1.0, jaccard + 0.05);
          matches.push({
            record_a: a,
            record_b: b,
            similarity_score: jaccard,
            match_type: 'chemical_overlap',
            confidence: confidence,
            matched_fields: ['chemicals', Array.from(intersection).join(', ')],
          });
        }
      }
    }

    return matches;
  }

  private buildClusters(records: LiteratureRecord[], matches: DuplicateMatch[]): DuplicateCluster[] {
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const find = (x: string): string => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    const union = (x: string, y: string): void => {
      const rx = find(x);
      const ry = find(y);
      if (rx === ry) return;
      if ((rank.get(rx) ?? 0) < (rank.get(ry) ?? 0)) {
        parent.set(rx, ry);
      } else if ((rank.get(rx) ?? 0) > (rank.get(ry) ?? 0)) {
        parent.set(ry, rx);
      } else {
        parent.set(ry, rx);
        rank.set(rx, (rank.get(rx) ?? 0) + 1);
      }
    };

    for (const record of records) {
      parent.set(record.source_id, record.source_id);
      rank.set(record.source_id, 0);
    }

    for (const match of matches) {
      union(match.record_a.source_id, match.record_b.source_id);
    }

    const clusters = new Map<string, LiteratureRecord[]>();
    for (const record of records) {
      const root = find(record.source_id);
      const cluster = clusters.get(root) || [];
      cluster.push(record);
      clusters.set(root, cluster);
    }

    return Array.from(clusters.entries()).map(([clusterId, clusterRecords]) => {
      const canonical = this.selectCanonicalRecord(clusterRecords);
      const clusterMatches = matches.filter(m =>
        clusterRecords.some(r => r.source_id === m.record_a.source_id) &&
        clusterRecords.some(r => r.source_id === m.record_b.source_id)
      );

      return {
        cluster_id: clusterId,
        records: clusterRecords,
        canonical_record: canonical,
        pairwise_matches: clusterMatches,
        cluster_confidence: clusterMatches.length > 0
          ? clusterMatches.reduce((sum, m) => sum + m.confidence, 0) / clusterMatches.length
          : 1.0,
        cluster_size: clusterRecords.length,
      };
    });
  }

  private selectCanonicalRecord(records: LiteratureRecord[]): LiteratureRecord {
    return records.sort((a, b) => {
      if (a.pmid && !b.pmid) return -1;
      if (!a.pmid && b.pmid) return 1;
      if (a.doi && !b.doi) return -1;
      if (!a.doi && b.doi) return 1;
      const aComplete = [a.pmid, a.doi, a.abstract, a.authors.length].filter(Boolean).length;
      const bComplete = [b.pmid, b.doi, b.abstract, b.authors.length].filter(Boolean).length;
      return bComplete - aComplete;
    })[0];
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3);
  }

  private stringSimilarity(a: string, b: string): number {
    const aTokens = new Set(this.tokenize(a));
    const bTokens = new Set(this.tokenize(b));
    const intersection = new Set([...aTokens].filter(x => bTokens.has(x)));
    const union = new Set([...aTokens, ...bTokens]);
    return intersection.size / union.size;
  }

  private extractYear(dateStr?: string): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : null;
  }

  private emptyStats() {
    return {
      exact_pmid_matches: 0,
      exact_doi_matches: 0,
      title_similarity_matches: 0,
      author_year_fuzzy_matches: 0,
      chemical_overlap_matches: 0,
      processing_time_ms: 0,
    };
  }

  private createResult(success: boolean, output: Agent1Output | null, executionTime: number, error?: string): AgentResult {
    const merkleData = {
      agent_id: 'agent-1-literature-duplicates',
      trace_id: '',
      success,
      output,
      execution_time: executionTime,
      timestamp: nowISO(),
    };
    const merkleEntryHash = sha256(JSON.stringify(merkleData));

    return {
      success,
      agent_id: 'agent-1-literature-duplicates',
      trace_id: '',
      output,
      error,
      execution_tier: 'LOCAL',
      latency_ms: executionTime,
      merkle_entry_hash: merkleEntryHash,
      execution_metadata: {
        timestamp: nowISO(),
      },
    };
  }
}

export function createLiteratureDuplicatesAgent(config: {
  tenant_id: string;
  inference_router: HybridInferenceRouter;
  audit_ledger: AuditLedgerService;
  zdr_store: ZDRStore;
}): LiteratureDuplicatesAgent {
  return new LiteratureDuplicatesAgent(config);
}