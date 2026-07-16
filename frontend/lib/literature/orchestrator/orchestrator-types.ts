export type PipelineStage =
  | "search_strategy"
  | "pubmed_search"
  | "article_fetch"
  | "document_processing"
  | "duplicate_detection"
  | "embedding"
  | "rag"
  | "hits_ai"
  | "screening_ai"
  | "completed";

export interface LiteraturePipelineRequest {
  tenantId: string;
  strategyName: string;
  query: string;
}

export interface PipelineStep {
  stage: PipelineStage;
  status: "pending" | "running" | "completed";
  startedAt?: string;
  completedAt?: string;
}

export interface LiteraturePipelineResult {
  id: string;
  tenantId: string;
  strategyName: string;
  query: string;
  steps: PipelineStep[];
  createdAt: string;
}

export interface PipelineStatus {
  totalRuns: number;
  completedRuns: number;
}