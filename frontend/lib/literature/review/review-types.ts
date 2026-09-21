export type EvidenceStatus = "PRESENT" | "ABSENT" | "UNRESOLVED";

export type ProductRole =
  | "SUSPECT"
  | "INTERACTING"
  | "CONCOMITANT"
  | "UNKNOWN";

export interface PatientProductEventRelationship {
  product: string;
  event: string;
  role: ProductRole;
  evidence: string;
}

export interface PatientSegment {
  segmentKey: string;
  patientDescriptor: string;
  identifiablePatient: EvidenceStatus;
  age?: number;
  ageUnit?: "years" | "months" | "days";
  sex?: "female" | "male" | "other" | "unknown";
  products: string[];
  events: string[];
  relationships: PatientProductEventRelationship[];
  sourceEvidence: string[];
  confidence?: number;
  reviewerNotes?: string;
}

export type ExpectednessConclusion =
  | "EXPECTED"
  | "UNEXPECTED"
  | "UNRESOLVED";

export interface LabelAssessmentInput {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  conclusion: ExpectednessConclusion;
  referenceLabelKey?: string;
  referenceLabelVersion?: string;
  referenceEffectiveDate?: string;
  evidence?: Record<string, unknown>;
  rationale: string;
}

export interface CausalityAssessmentInput {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  methodKey?: string;
  methodVersion?: string;
  conclusion: string;
  evidence?: Record<string, unknown>;
  rationale: string;
}

export type MedicalReviewDecision =
  | "APPROVE_FOR_INTAKE"
  | "EXCLUDE"
  | "REVIEW_REQUIRED";

export interface MedicalReviewInput {
  decision: MedicalReviewDecision;
  comments: string;
  unresolvedAcknowledged?: boolean;
}

export interface ReviewWorkspaceDetail {
  workspaceId: string;
  packageId: string;
  packageKey: string;
  pmid: string;
  doi?: string;
  title: string;
  abstract: string;
  authors: string[];
  publicationDate?: string;
  workflowState: string;
  workspaceStatus: string;
  workspaceVersion: number;
  patientSegmentationStatus: string;
  patientCount?: number;
  patientSegments: PatientSegment[];
  labelingStatus: string;
  causalityStatus: string;
  mrReviewStatus: string;
  screening: {
    resultId: string;
    resultVersion: number;
    decision: string;
    confidence?: number;
    reviewedAt?: string;
    reviewedBy?: string;
    products: string[];
    events: string[];
  };
  labelAssessments: Array<LabelAssessmentInput & {
    id: string;
    assessedAt: string;
    assessedBy?: string;
  }>;
  causalityAssessments: Array<CausalityAssessmentInput & {
    id: string;
    assessedAt: string;
    assessedBy?: string;
  }>;
  medicalReview?: {
    status: string;
    finalDecision?: string;
    comments?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    reviewVersion: number;
  };
}
