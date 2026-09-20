import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";

export type EvidenceStatus =
  | "PRESENT"
  | "ABSENT"
  | "UNRESOLVED"
  | "CONFLICTING";

export type PopulationType =
  | "HUMAN"
  | "ANIMAL"
  | "MIXED"
  | "UNRESOLVED";

export type PatientSafetyRelevance =
  | "RELEVANT"
  | "NOT_RELEVANT"
  | "UNRESOLVED";

export type IcsrConclusion =
  | "POTENTIAL_ICSR"
  | "NOT_ICSR"
  | "UNRESOLVED";

export interface SafetyEvidenceExtraction {
  populationType: PopulationType;
  patientIdentifiable: EvidenceStatus;
  reporterIdentifiable: EvidenceStatus;
  medicinalProductExposure: EvidenceStatus;
  adverseEventOrReaction: EvidenceStatus;
  specialSituation: EvidenceStatus;
  patientEvidence?: string;
  reporterEvidence?: string;
  productEvidence?: string;
  eventEvidence?: string;
  specialSituationEvidence?: string;
}

export interface PatientSafetyAssessment {
  relevance: PatientSafetyRelevance;
  humanSafetyInformation: boolean | null;
  populationType: PopulationType;
  medicinalProductExposure: EvidenceStatus;
  adverseEventOrReaction: EvidenceStatus;
  specialSituation: EvidenceStatus;
  manualReviewRequired: boolean;
  reasons: string[];
  evidence: {
    patient?: string;
    product?: string;
    event?: string;
    specialSituation?: string;
  };
  appliedKnowledgeObjectIds: string[];
}

export interface IcsrCriteriaAssessment {
  identifiablePatient: EvidenceStatus;
  identifiableReporter: EvidenceStatus;
  suspectProduct: EvidenceStatus;
  adverseEventOrSpecialSituation: EvidenceStatus;
  minimumCriteriaSatisfied: boolean | null;
  conclusion: IcsrConclusion;
  manualReviewRequired: boolean;
  missingOrUnresolvedCriteria: string[];
  reasons: string[];
  evidence: {
    patient?: string;
    reporter?: string;
    suspectProduct?: string;
    eventOrSpecialSituation?: string;
  };
  appliedKnowledgeObjectIds: string[];
}

export interface PVDecisionAssessment {
  patientSafety: PatientSafetyAssessment;
  icsr: IcsrCriteriaAssessment;
}

export interface PVDecisionAssessmentInput {
  safetyEvidence: SafetyEvidenceExtraction;
  detectedEvents: string[];
  detectedSpecialSituations: string[];
  suspectEvidence: SuspectProductEvidence[];
  reporterIdentifiers?: string[];
}
