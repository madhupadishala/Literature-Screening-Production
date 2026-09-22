export const DUPLICATE_ALGORITHM_KEY = "NEXUS_DETERMINISTIC_DUPLICATE_MATCHER";
export const DUPLICATE_ALGORITHM_VERSION = "1.0.0";
export const DUPLICATE_CANDIDATE_THRESHOLD = 25;

export type DuplicateConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

export interface DuplicatePatientFingerprint {
  patientReference?: string | null;
  sex?: string | null;
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: string | null;
}

export interface DuplicateReporterFingerprint {
  qualification?: string | null;
  organization?: string | null;
  countryCode?: string | null;
}

export interface DuplicateProductFingerprint {
  reportedName: string;
  roleCharacterization?: string | null;
}

export interface DuplicateEventFingerprint {
  reportedTerm: string;
  onsetDate?: string | null;
}

export interface DuplicateFingerprint {
  intakeRecordId: string;
  intakeKey: string;
  caseId?: string | null;
  caseKey?: string | null;
  externalReference?: string | null;
  sourceRecordKey?: string | null;
  sourceType?: string | null;
  countryCode?: string | null;
  initialReceiptDate?: string | null;
  latestReceiptDate?: string | null;
  sourceIdentifiers: string[];
  patients: DuplicatePatientFingerprint[];
  reporters: DuplicateReporterFingerprint[];
  products: DuplicateProductFingerprint[];
  events: DuplicateEventFingerprint[];
}

export interface DuplicateMatchedFactor {
  key: string;
  weight: number;
  evidence: string;
}

export interface DuplicateMatchResult {
  candidate: DuplicateFingerprint;
  score: number;
  confidenceBand: DuplicateConfidenceBand;
  matchedFactors: DuplicateMatchedFactor[];
}

export type DuplicateHumanDecision =
  | "NEW_CASE"
  | "FOLLOW_UP"
  | "DUPLICATE"
  | "NOT_MATCH";
