export type MinimumCriterionStatus = "MET" | "MISSING" | "UNRESOLVED";

export type MinimumCriterionKey =
  | "IDENTIFIABLE_PATIENT"
  | "IDENTIFIABLE_REPORTER"
  | "SUSPECT_PRODUCT"
  | "ADVERSE_EVENT";

export interface MinimumCriterionAssessment {
  key: MinimumCriterionKey;
  status: MinimumCriterionStatus;
  evidence: string[];
  reason: string;
}

export const SERIOUSNESS_CRITERIA = [
  "DEATH",
  "LIFE_THREATENING",
  "HOSPITALIZATION_OR_PROLONGATION",
  "DISABILITY_OR_INCAPACITY",
  "CONGENITAL_ANOMALY_OR_BIRTH_DEFECT",
  "IMPORTANT_MEDICAL_EVENT",
] as const;

export type SeriousnessCriterion = (typeof SERIOUSNESS_CRITERIA)[number];

export const SPECIAL_SITUATIONS = [
  "PREGNANCY",
  "BREASTFEEDING",
  "PEDIATRIC",
  "ELDERLY",
  "OVERDOSE",
  "OFF_LABEL_USE",
  "MISUSE",
  "ABUSE",
  "MEDICATION_ERROR",
  "OCCUPATIONAL_EXPOSURE",
  "LACK_OF_THERAPEUTIC_EFFICACY",
  "FALSIFIED_MEDICINAL_PRODUCT",
] as const;

export type SpecialSituation = (typeof SPECIAL_SITUATIONS)[number];

export type TriageOutcome =
  | "READY_FOR_DUPLICATE_REVIEW"
  | "FOLLOW_UP_REQUIRED"
  | "NOT_VALID_ICSR"
  | "HOLD_FOR_CLARIFICATION";

export interface TriageSystemSnapshot {
  criteria: MinimumCriterionAssessment[];
  validityRecommendation: "VALID" | "UNRESOLVED";
  seriousnessRecommendation: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  seriousnessEvidence: Partial<Record<SeriousnessCriterion, string[]>>;
  detectedSpecialSituations: SpecialSituation[];
  followUpRecommended: boolean;
  followUpReasons: string[];
  priorityRecommendation: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}

export interface FinalTriageDecision {
  minimumCriteria: MinimumCriterionAssessment[];
  humanValidityDecision: "VALID" | "INVALID" | "UNRESOLVED";
  seriousnessStatus: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  seriousnessCriteria: Partial<Record<SeriousnessCriterion, boolean>>;
  specialSituations: SpecialSituation[];
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  followUpRequired: boolean;
  followUpReasons: string[];
  rationale: string;
}
