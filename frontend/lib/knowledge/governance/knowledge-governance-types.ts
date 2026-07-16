export type KnowledgeApprovalStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "rejected"
  | "effective"
  | "superseded"
  | "retired";

export type KnowledgeGovernanceAction =
  | "submit_for_review"
  | "approve"
  | "reject"
  | "mark_effective"
  | "supersede"
  | "retire";

export interface KnowledgeGovernanceRecord {
  id: string;
  knowledgeDocumentId: string;
  tenantId?: string;
  status: KnowledgeApprovalStatus;
  version: string;
  effectiveDate?: string;
  reviewDueDate?: string;
  trainingRequired: boolean;
  reviewer?: string;
  approver?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeGovernanceAuditEvent {
  id: string;
  governanceRecordId: string;
  action: KnowledgeGovernanceAction;
  actor: string;
  comment?: string;
  createdAt: string;
}

export interface CreateGovernanceRecordInput {
  knowledgeDocumentId: string;
  tenantId?: string;
  version: string;
  effectiveDate?: string;
  reviewDueDate?: string;
  trainingRequired?: boolean;
  reviewer?: string;
  approver?: string;
}

export interface GovernanceActionInput {
  governanceRecordId: string;
  action: KnowledgeGovernanceAction;
  actor: string;
  comment?: string;
}

export interface KnowledgeGovernanceStatus {
  totalRecords: number;
  inReview: number;
  approved: number;
  effective: number;
  trainingRequired: number;
}