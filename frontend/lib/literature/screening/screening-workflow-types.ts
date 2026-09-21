import type { CompanySuspectAssessment } from "@/lib/pharmaceutical-intelligence/types";
import type {
  IcsrCriteriaAssessment,
  PatientSafetyAssessment,
  SafetyEvidenceExtraction,
} from "@/lib/pv-decision-intelligence/types";
import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";
import type {
  ScreeningDecision,
  ScreeningFinding,
  ScreeningReason,
  ScreeningRegulatoryEvidence,
} from "./screening-types";

export type ScreeningReviewStatus = "pending" | "approved" | "excluded" | "flagged";

export interface ScreeningWorklistRecord {
  packageId: string;
  packageKey: string;
  screeningResultId?: string;
  resultVersion: number;
  pmid: string;
  doi?: string;
  title: string;
  journal: string;
  publicationDate: string;
  authors: string[];
  abstractText: string;
  productName: string;
  countryOfInterest: string;
  workflowState: string;
  contextStage: "HITS_APPROVED" | "SCREENING_AI";
  upstreamHitsResultVersion?: number;
  upstreamHitsDetectedEvents?: string[];
  executionStatus: "ready" | "completed" | "failed";
  decision: ScreeningDecision;
  confidence: number;
  reason: ScreeningReason;
  findings: ScreeningFinding[];
  safetyEvidence?: SafetyEvidenceExtraction;
  patientSafetyAssessment?: PatientSafetyAssessment;
  icsrAssessment?: IcsrCriteriaAssessment;
  regulatoryEvidence?: ScreeningRegulatoryEvidence;
  extractedSuspectEvidence?: SuspectProductEvidence[];
  companySuspectAssessments?: CompanySuspectAssessment[];
  qcRequired: boolean;
  reviewStatus: ScreeningReviewStatus;
  reviewVersion: number;
  intakeExportId?: string;
  intakeExportVersion?: number;
  reviewComments?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  aiExecution?: Record<string, unknown>;
  error?: string;
}

export interface ExecuteScreeningInput {
  packageId: string;
  reason: string;
}

export interface SaveScreeningReviewInput {
  packageId: string;
  screeningResultId: string;
  status: ScreeningReviewStatus;
  finalDecision: ScreeningDecision;
  comments: string;
  expectedVersion?: number;
}

export interface ScreeningWorkflowMutation {
  packageId: string;
  screeningResultId: string;
  workflowState: "SCREENING_REVIEW" | "SCREENING_COMPLETE" | "REVIEW_READY";
  reviewStatus: ScreeningReviewStatus;
  finalDecision: ScreeningDecision;
  reviewVersion: number;
}
