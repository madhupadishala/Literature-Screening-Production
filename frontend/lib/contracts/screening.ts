/**
 * Screening Service Contract
 *
 * Defines the interface for literature screening (title/abstract + full-text).
 * Implemented by: Frontend lib/literature/screening/* (workflow orchestration)
 * Agentic_AI AG17 (safety assessment engine)
 * Frontend adapters: lib/adapters/agentic-ai-screening-adapter.ts
 */

export interface ScreeningCriteria {
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  keywords?: string[];
  requiredFields?: string[];
}

export interface ScreeningRecord {
  id: string;
  title: string;
  authors: string[];
  abstract?: string;
  fullText?: string;
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  keywords?: string[];
}

export interface ScreeningDecision {
  recordId: string;
  decision: "include" | "exclude" | "maybe";
  confidence: number; // 0-1
  rationale: string;
  matchedCriteria: {
    inclusion: string[];
    exclusion: string[];
  };
  reviewerNotes?: string;
  aiExecution?: {
    provider: string;
    model: string;
    requestId: string;
    latencyMs: number;
    tokenUsage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      attempts: number;
    };
  };
}

export interface ScreeningResult {
  decisions: ScreeningDecision[];
  summary: {
    total: number;
    included: number;
    excluded: number;
    maybe: number;
  };
  processingTimeMs: number;
}

export interface ScreeningService {
  /**
   * Screen a single record
   */
  screenRecord(record: ScreeningRecord, criteria: ScreeningCriteria): Promise<ScreeningDecision>;

  /**
   * Screen multiple records in batch
   */
  screenRecords(records: ScreeningRecord[], criteria: ScreeningCriteria): Promise<ScreeningResult>;

  /**
   * Get screening criteria for a project
   */
  getCriteria(projectId: string): Promise<ScreeningCriteria>;

  /**
   * Save screening criteria
   */
  saveCriteria(projectId: string, criteria: ScreeningCriteria): Promise<void>;
}

export interface ScreeningWorkflowService {
  /**
   * Start a screening workflow
   */
  startWorkflow(input: {
    projectId: string;
    records: ScreeningRecord[];
    criteria: ScreeningCriteria;
    reviewers: string[];
  }): Promise<{ workflowId: string; status: string }>;

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): Promise<{
    status: "pending" | "in_progress" | "completed" | "failed";
    progress: number;
    results?: ScreeningResult;
  }>;

  /**
   * Submit reviewer decision
   */
  submitDecision(workflowId: string, decision: ScreeningDecision): Promise<void>;
}