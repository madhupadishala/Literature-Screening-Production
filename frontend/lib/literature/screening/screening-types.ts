import type {
  EvidenceStatus,
  IcsrCriteriaAssessment,
  PatientSafetyAssessment,
  SafetyEvidenceExtraction,
} from "@/lib/pv-decision-intelligence/types";
import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";

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


export type LiteraturePublicationClassification =
  | "CASE_REPORT"
  | "CASE_SERIES"
  | "CLINICAL_TRIAL"
  | "OBSERVATIONAL_STUDY"
  | "REVIEW_ARTICLE"
  | "META_ANALYSIS"
  | "CONFERENCE_ABSTRACT"
  | "EDITORIAL"
  | "LETTER"
  | "ANIMAL_STUDY"
  | "IN_VITRO_STUDY"
  | "REGISTRY_STUDY"
  | "DATABASE_ANALYSIS"
  | "OTHER"
  | "UNRESOLVED";

export type EventSeriousness =
  | "SERIOUS"
  | "NON_SERIOUS"
  | "UNRESOLVED";

export type EventSeverity =
  | "MILD"
  | "MODERATE"
  | "SEVERE"
  | "UNRESOLVED";

export type SeriousnessCriterion =
  | "DEATH"
  | "LIFE_THREATENING"
  | "HOSPITALIZATION"
  | "DISABILITY"
  | "CONGENITAL_ANOMALY"
  | "OTHER_MEDICALLY_IMPORTANT"
  | "NONE_IDENTIFIED";

export interface ScreeningClinicalEvent {
  event: string;
  evidence?: string;
  severity: EventSeverity;
  seriousness: EventSeriousness;
  seriousnessCriteria: SeriousnessCriterion[];
}

export interface ScreeningRegulatoryEvidence {
  publicationClassification: LiteraturePublicationClassification;
  publicationClassificationEvidence?: string;
  clinicalEvents: ScreeningClinicalEvent[];
  patientPiiStatus: EvidenceStatus;
  patientPiiEvidence?: string;
  countryOfIncidenceStatus: EvidenceStatus;
  countryOfIncidence?: string;
  countryOfIncidenceEvidence?: string;
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
  safetyEvidence?: SafetyEvidenceExtraction;
  patientSafetyAssessment?: PatientSafetyAssessment;
  icsrAssessment?: IcsrCriteriaAssessment;
  regulatoryEvidence?: ScreeningRegulatoryEvidence;
  extractedSuspectEvidence?: SuspectProductEvidence[];
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
