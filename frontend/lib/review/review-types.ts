export type ReviewStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "overridden";

export type ReviewDecision =
  | "accept_ai"
  | "override_ai"
  | "reject_case"
  | "needs_second_review";

export interface AIExecutionMetadata {
  agentName: string;
  agentVersion: string;
  promptVersion: string;
  modelName: string;
  modelVersion: string;
  confidence: number;
  executedAt: string;
}

export interface ReviewEvidenceReference {
  sourceId: string;
  sourceType: string;
  description?: string;
}

export interface ReviewerDecision {
  reviewerId: string;
  reviewerName?: string;
  decision: ReviewDecision;
  comments?: string;
  overrideReason?: string;
  reviewedAt: string;
}

export interface ReviewRecord {
  id: string;
  tenantId: string;

  articleId?: string;
  evidencePackageId?: string;

  workflowStage:
    | "hits"
    | "screening"
    | "intake"
    | "qc";

  status: ReviewStatus;

  aiExecution: AIExecutionMetadata;

  aiResult: unknown;

  reviewerDecision?: ReviewerDecision;

  evidence: ReviewEvidenceReference[];

  createdAt: string;

  updatedAt: string;
}

export interface SaveReviewRequest {
  tenantId: string;
  review: ReviewRecord;
}

export interface SaveReviewResponse {
  success: boolean;
  review: ReviewRecord;
}