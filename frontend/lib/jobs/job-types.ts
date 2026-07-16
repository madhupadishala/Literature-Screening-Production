export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type JobPriority = "low" | "normal" | "high" | "critical";

export type JobType =
  | "article_fetch"
  | "fulltext_fetch"
  | "pdf_parse"
  | "ocr"
  | "embedding"
  | "vector_index"
  | "rag_context"
  | "hits_ai"
  | "screening_ai"
  | "evidence_package"
  | "export"
  | "notification"
  | "system";

export interface JobRecord {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  progress: number;
  error?: string;
  result?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateJobInput {
  tenantId: string;
  type: JobType;
  payload?: Record<string, unknown>;
  priority?: JobPriority;
  maxAttempts?: number;
  createdBy?: string;
}

export interface JobSummary {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}