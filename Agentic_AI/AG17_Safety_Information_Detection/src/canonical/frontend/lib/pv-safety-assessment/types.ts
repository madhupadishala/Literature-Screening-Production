import type { SeriousnessInput } from "./seriousness-engine";

export type EvidenceStatus =
  | "PRESENT"
  | "ABSENT"
  | "UNRESOLVED"
  | "CONFLICTING";

export type SourceCoverage =
  | "TITLE_ONLY"
  | "ABSTRACT_ONLY"
  | "FULL_TEXT";

export type SafetyRelevance =
  | "CASE_SAFETY"
  | "AGGREGATE_SAFETY"
  | "BOTH"
  | "NONE"
  | "UNRESOLVED";

export type ProductRole =
  | "SUSPECT"
  | "CO_SUSPECT"
  | "CONCOMITANT"
  | "COMBINATION_INGREDIENT"
  | "TREATMENT"
  | "EXPOSURE"
  | "OVERDOSE_INGESTION"
  | "PRODUCT_MENTION"
  | "UNRESOLVED";

export type AuthorCausality =
  | "ATTRIBUTED"
  | "POSSIBLY_RELATED"
  | "UNLIKELY_RELATED"
  | "RULED_OUT"
  | "ATTRIBUTED_TO_OTHER_CAUSE"
  | "NOT_STATED"
  | "UNRESOLVED";

export type RelationStatus =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "UNRESOLVED"
  | "CONFLICTING";

export type SpecialSituation =
  | "MISUSE"
  | "ABUSE"
  | "INTENTIONAL_OVERDOSE"
  | "ACCIDENTAL_OVERDOSE"
  | "SUICIDE_ATTEMPT"
  | "MEDICATION_ERROR"
  | "OFF_LABEL_USE"
  | "PREGNANCY_EXPOSURE"
  | "BREASTFEEDING_EXPOSURE"
  | "LACK_OF_EFFICACY"
  | "OCCUPATIONAL_EXPOSURE"
  | "DRUG_INTERACTION"
  | "OTHER_ABNORMAL_USE";

export interface EvidenceReference {
  text: string;
  location?: string;
}

export interface ProductSafetyAssessmentInput {
  product: string;
  normalizedProduct?: string;
  role: ProductRole;
  roleEvidence?: EvidenceReference;
  eventRelation: RelationStatus;
  eventRelationEvidence?: EvidenceReference[];
  authorCausality: AuthorCausality;
  authorCausalityEvidence?: EvidenceReference[];
  alternativeCausePresent?: EvidenceStatus;
  alternativeCauseEvidence?: EvidenceReference[];
  doseResponse?: EvidenceStatus;
  dechallenge?: EvidenceStatus;
  rechallenge?: EvidenceStatus;
}

export interface SpecialSituationAssessmentInput {
  type: SpecialSituation;
  products: string[];
  evidence: EvidenceReference[];
}

export interface PvSafetyAssessmentInput {
  seriousnessInput?: SeriousnessInput;
  sourceCoverage: SourceCoverage;
  publicationType: string;
  humanPopulation: EvidenceStatus;
  identifiablePatient: EvidenceStatus;
  adverseEventOrReaction: EvidenceStatus;
  eventEvidence?: EvidenceReference[];
  finalDiagnosis?: string;
  finalDiagnosisEvidence?: EvidenceReference[];
  symptoms?: string[];
  products: ProductSafetyAssessmentInput[];
  specialSituations: SpecialSituationAssessmentInput[];
  aggregateSafetyEvidence?: EvidenceReference[];
}

export interface ProductSafetyAssessment
  extends ProductSafetyAssessmentInput {
  suspectForEvent: boolean | null;
  rationale: string[];
}

export interface PvSafetyAssessmentResult {
  seriousness?: ReturnType<typeof import("./seriousness-engine").assessSeriousness>;
  sourceCoverage: SourceCoverage;
  publicationType: string;
  safetyRelevance: SafetyRelevance;
  caseSafetyPresent: boolean | null;
  aggregateSafetyPresent: boolean | null;
  fullScreeningRequired: boolean;
  exclusionCanBeFinalized: boolean;
  manualReviewRequired: boolean;
  productAssessments: ProductSafetyAssessment[];
  specialSituations: SpecialSituationAssessmentInput[];
  finalDiagnosis?: string;
  symptoms: string[];
  rationale: string[];
  appliedKnowledgeObjectIds: string[];
  knowledgeGaps: string[];
}

export const PV_SAFETY_V1_KNOWLEDGE_OBJECTS = [
  "SDI-002",
  "SDI-003",
  "SDI-006",
  "SDI-008",
  "SDI-010",
  "OI-004",
  "OI-005",
  "OI-006",
  "VAL-001",
  "VAL-004",
  "VAL-005",
  "VAL-008",
  "VAL-010",
] as const;
