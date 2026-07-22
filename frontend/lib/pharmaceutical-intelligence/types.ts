export type PharmaceuticalRelationship =
  | "EXACT_NAME"
  | "EQUIVALENT_NAME"
  | "COMMON_SALT_OF"
  | "RELATED_DISTINCT_SUBSTANCE"
  | "AMBIGUOUS_FAMILY_NAME"
  | "UNRESOLVED";

export type PresentationQualifierRole =
  | "PRODUCT_PRESENTATION"
  | "ADMINISTRATION_CIRCUMSTANCE"
  | "NOT_REPORTED"
  | "UNCLEAR";

export type CompanySuspectConclusion =
  | "CONFIRMED"
  | "NOT_COMPANY_PRODUCT"
  | "NOT_COMPANY_PRESENTATION"
  | "NO_ACTIVE_LICENCE_IN_COI"
  | "UNRESOLVED";

export interface SuspectProductEvidence {
  reportedProduct: string;
  reportedChemicalName?: string;
  reportedComposition?: string;
  reportedDosageForm?: string;
  reportedFormulation?: string;
  reportedAdministrationRoute?: string;
  presentationQualifierRole?: PresentationQualifierRole;
  countryOfInterest?: string;
  relevantDate?: string;
  sourceEvidence?: string;
}

export interface ProductMasterCandidate {
  recordIndex: number;
  productId?: string;
  preferredName: string;
  matchedName: string;
  relationship: PharmaceuticalRelationship;
  dosageForm?: string;
  formulation?: string;
  route?: string;
  country?: string;
  mah?: string;
  licenceEffectiveFrom?: string;
  licenceEffectiveTo?: string;
  active?: boolean;
  sourceRecord: Record<string, unknown>;
}

export interface ProductDecisionStep {
  sequence: number;
  code: string;
  outcome: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE";
  explanation: string;
  evidence?: Record<string, unknown>;
  scenarioIds: string[];
}

export interface CompanySuspectAssessment {
  assessmentId: string;
  knowledgeVersion: string;
  reportedProduct: string;
  normalizedProduct?: string;
  preservedSalt?: string;
  relationship: PharmaceuticalRelationship;
  candidates: ProductMasterCandidate[];
  selectedCandidate?: ProductMasterCandidate;
  productMatched: boolean;
  presentationMatched: boolean | null;
  countryOfInterest?: string;
  licenceStatus: "ACTIVE" | "INACTIVE" | "NOT_CONFIGURED" | "UNRESOLVED";
  companySuspect: boolean | null;
  conclusion: CompanySuspectConclusion;
  specialSituationReviewRequired: boolean;
  manualReviewRequired: boolean;
  appliedScenarioIds: string[];
  prohibitedConclusions: string[];
  decisionTrail: ProductDecisionStep[];
}

export interface PharmaceuticalScenario {
  id: string;
  title: string;
  status: "APPROVED";
  version: string;
  decisionArea: string;
  rule: string;
  triggers: string[];
  expectedDecision: Record<string, unknown>;
  prohibitedConclusions: string[];
  manualReviewWhen: string[];
  examples: Array<Record<string, unknown>>;
}
