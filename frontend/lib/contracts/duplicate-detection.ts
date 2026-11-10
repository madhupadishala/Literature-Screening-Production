/**
 * Duplicate Detection Service Contract
 *
 * Defines the interface for duplicate detection across literature and ICSR records.
 * Implemented by: Agentic_AI AG18 (Literature) + AG19 (ICSR)
 * Frontend adapters: lib/adapters/agentic-ai-duplicate-adapter.ts
 */

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
  /**
   * Find potential duplicates for a given record
   */
  findDuplicates(input: DuplicateInput): Promise<DuplicateDetectionResult>;

  /**
   * Check if a specific candidate is a duplicate of any existing records
   */
  checkDuplicate(candidate: DuplicateInput, existing: DuplicateRecord[]): Promise<DuplicateMatch | null>;

  /**
   * Batch check multiple candidates
   */
  batchCheckDuplicates(candidates: DuplicateInput[], existing: DuplicateRecord[]): Promise<DuplicateMatch[]>;

  /**
   * Get duplicate statistics
   */
  getStats(): Promise<{
    totalRecords: number;
    totalDuplicatesFound: number;
    lastRun: string;
  }>;
}

// Type for the service factory
export interface DuplicateDetectionServiceFactory {
  create(config?: { threshold?: number }): DuplicateDetectionService;
}