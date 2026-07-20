export type DuplicateMatchType =
  | "PMID"
  | "DOI"
  | "TITLE"
  | "TITLE_PRODUCT"
  | "SEMANTIC";

export interface DuplicateCandidate {
  id: string;

  articleId: string;

  pmid?: string;

  doi?: string;

  title: string;

  productName?: string;

  source?: string;
}

export interface DuplicateMatch {
  articleId: string;

  matchType: DuplicateMatchType;

  confidence: number;

  reason: string;
}

export interface DuplicateCheckRequest {
  tenantId: string;

  article: DuplicateCandidate;

  existingArticles: DuplicateCandidate[];
}

export interface DuplicateCheckResponse {
  candidate: DuplicateCandidate;

  isDuplicate: boolean;

  confidence: number;

  matches: DuplicateMatch[];

  checkedArticles: number;

  workflowStage: "DUPLICATE_CHECK_COMPLETED";

  checkedAt: string;
}

export type DuplicateCheckResult = DuplicateCheckResponse;

export interface DuplicateStatus {
  totalChecks: number;

  checkedRecords: number;

  duplicateRecords: number;

  duplicatesDetected: number;

  lastCheckAt?: string;
}