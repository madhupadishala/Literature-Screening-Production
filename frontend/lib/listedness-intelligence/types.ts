export type ListednessStatus = "LISTED" | "UNLISTED" | "UNRESOLVED";

export type ListednessMatchType =
  | "EXACT"
  | "NORMALIZED_TEXT"
  | "SPELLING_VARIANT"
  | "SYNONYM"
  | "LAB_EXACT"
  | "LAB_SYNONYM"
  | "PARTIAL_RETRIEVAL_THEN_EXACT_CONCEPT"
  | "CASE_NARROWER_THAN_LABEL"
  | "QUALIFIER_MISMATCH"
  | "NEGATED"
  | "CLASS_EFFECT"
  | "OTHER_PRODUCT"
  | "CONDITIONAL_MATCH"
  | "CONDITIONAL_MISMATCH"
  | "CONDITIONAL_UNKNOWN"
  | "LAB_THRESHOLD_MISMATCH"
  | "NO_MATCH";

export interface ListednessLabelEvidence {
  text: string;
  section?: string;
  documentId?: string;
  documentType?: string;
  documentVersion?: string;
  effectiveDate?: string;
  subjectProduct?: string;
  page?: number;
  chunkId?: string;
}

export interface ListednessCaseContext {
  milkExposure?: boolean | null;
  foodExposure?: boolean | null;
  grapefruitExposure?: boolean | null;
  alcoholExposure?: boolean | null;
  coExposures?: string[];
  deniedCoExposures?: string[];
}

export interface ListednessLabContext {
  value?: number;
  unit?: string;
  uln?: number;
  lln?: number;
  ulnRatio?: number;
  llnRatio?: number;
}

export interface ListednessAssessmentInput {
  reportedEvent: string;
  eventKind?: "CLINICAL_EVENT" | "LAB";
  labelEvidence: ListednessLabelEvidence[];
  caseContext?: ListednessCaseContext;
  labContext?: ListednessLabContext;
}

export interface ListednessEvidenceDecision {
  evidence: ListednessLabelEvidence;
  conceptMatched: boolean;
  status: ListednessStatus;
  matchType: ListednessMatchType;
  reasonCode: string;
  rationale: string;
}

export interface ListednessAssessment {
  reportedEvent: string;
  normalizedEvent: string;
  listedness: ListednessStatus;
  manualReviewRequired: boolean;
  reasonCode: string;
  rationale: string;
  bestEvidence?: ListednessLabelEvidence;
  evidenceDecisions: ListednessEvidenceDecision[];
}
