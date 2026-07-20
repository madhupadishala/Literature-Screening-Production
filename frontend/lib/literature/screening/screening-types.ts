export type ScreeningDecision =
  | "INCLUDE"
  | "EXCLUDE"
  | "REVIEW";

export type ScreeningReason =
  | "CASE_REPORT"
  | "ADVERSE_EVENT"
  | "PRODUCT_MENTION"
  | "HUMAN_STUDY"
  | "ANIMAL_STUDY"
  | "REVIEW_ARTICLE"
  | "NO_ADVERSE_EVENT"
  | "NON_MEDICAL"
  | "INSUFFICIENT_INFORMATION"
  | "NON_ENGLISH"
  | "DUPLICATE"
  | "UNKNOWN";

export interface ScreeningRequest {
  tenantId: string;
  correlationId?: string;
  article: {
    pmid: string;
    title: string;
    abstract?: string;
    authors: string[];
    journal?: string;
    publicationDate?: string;
    doi?: string;
    language?: string;
    country?: string;
    keywords?: string[];
    meshTerms?: string[];
    fullTextAvailable?: boolean;
  };
}

export interface ScreeningFinding {
  rule: string;
  passed: boolean;
  score: number;
  comment: string;
}

export interface ScreeningResponse {
  tenantId: string;
  pmid: string;
  decision: ScreeningDecision;
  confidence: number;
  reason: ScreeningReason;
  findings: ScreeningFinding[];
  screenedAt: string;
  workflowStage: "SCREENING_COMPLETED";
}

export interface ScreeningStatus {
  totalScreened: number;
  included: number;
  excluded: number;
  reviewRequired: number;
  lastScreenedAt?: string;
}
