import type { ScreeningDecision, ScreeningFinding, ScreeningReason } from "./screening-types";

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
  executionStatus: "ready" | "completed" | "failed";
  decision: ScreeningDecision;
  confidence: number;
  reason: ScreeningReason;
  findings: ScreeningFinding[];
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
  workflowState: "SCREENING_REVIEW" | "SCREENING_COMPLETE";
  reviewStatus: ScreeningReviewStatus;
  finalDecision: ScreeningDecision;
  reviewVersion: number;
}
