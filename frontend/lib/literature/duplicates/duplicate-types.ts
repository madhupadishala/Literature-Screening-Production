export type DuplicateMatchType =
  | "DOI"
  | "TRIAL_REGISTRY"
  | "PMID"
  | "TITLE"
  | "TITLE_AUTHOR_DATE"
  | "TITLE_PRODUCT"
  | "SEMANTIC";

export interface DuplicateCandidate {
  id: string;

  articleId: string;

  pmid?: string;

  doi?: string;

  // ClinicalTrials.gov NCT number or equivalent trial-registry ID, when
  // present in the abstract/metadata. Strongest signal after DOI for
  // RCTs specifically -- two papers reporting the same trial ID are
  // almost certainly reporting the same underlying study.
  trialRegistryId?: string;

  title: string;

  authors?: string[];

  // ISO date (yyyy-mm-dd) if known.
  publicationDate?: string;

  productName?: string;

  source?: string;
}

export interface DuplicateMatch {
  articleId: string;

  matchType: DuplicateMatchType;

  confidence: number;

  reason: string;

  // True for signals that are corroborative but not identity-grade on
  // their own (currently: SEMANTIC only). A requiresReview match should
  // never be silently auto-merged -- route to a human reviewer instead.
  // This also covers the "companion/sub-analysis" case: two genuinely
  // distinct papers from the same underlying study can look similar on
  // title/semantic grounds without actually being duplicates, and that
  // distinction needs a person, not a matching rule.
  requiresReview: boolean;
}

export interface DuplicateCheckRequest {
  tenantId: string;

  article: DuplicateCandidate;

  existingArticles: DuplicateCandidate[];
}

export interface DuplicateCheckResponse {
  candidate: DuplicateCandidate;

  isDuplicate: boolean;

  // True when the strongest match found requires human review before
  // being treated as a confirmed duplicate (e.g. semantic-only match).
  requiresReview: boolean;

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
