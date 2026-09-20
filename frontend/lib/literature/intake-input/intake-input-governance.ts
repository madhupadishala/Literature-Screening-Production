import type { CompanySuspectAssessment } from "@/lib/pharmaceutical-intelligence/types";
import { validateAuditReason } from "@/lib/audit/reason";

import { finalIncludeEligibility } from "../screening/governed-decision";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractCompanyAssessmentsFromScreeningPayload(
  payload: unknown,
): CompanySuspectAssessment[] {
  if (!isRecord(payload)) return [];
  const result = isRecord(payload.result) ? payload.result : {};
  return Array.isArray(result.companySuspectAssessments)
    ? (result.companySuspectAssessments.filter(isRecord) as unknown as CompanySuspectAssessment[])
    : [];
}

export function validateIntakeGenerationReason(value: unknown): string {
  const validation = validateAuditReason(value);
  if (!validation.valid) {
    throw new Error(
      validation.message || "A specific GxP-controlled generation reason is required.",
    );
  }
  return validation.reason;
}

export interface IntakeGenerationGateInput {
  workflowState: string;
  screeningReviewStatus: string;
  screeningFinalDecision: string;
  hitsReviewStatus: string | null;
  hitsReviewDecision: string | null;
  companyAssessments: CompanySuspectAssessment[];
}

export function assertIntakeGenerationGate(input: IntakeGenerationGateInput): void {
  if (!["SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(input.workflowState)) {
    throw new Error(
      `Intake input cannot be generated from workflow state ${input.workflowState}.`,
    );
  }

  if (
    input.screeningReviewStatus !== "approved" ||
    input.screeningFinalDecision !== "INCLUDE"
  ) {
    throw new Error("Intake input requires an approved INCLUDE screening decision.");
  }

  if (
    input.hitsReviewStatus !== "approved" ||
    input.hitsReviewDecision !== "accept_ai"
  ) {
    throw new Error(
      "Intake input requires a completed human Hits review with an accepted governed Hit.",
    );
  }

  const eligibility = finalIncludeEligibility(input.companyAssessments);
  if (!eligibility.eligible) {
    throw new Error(
      `Intake input cannot be generated: ${eligibility.reason}`,
    );
  }
}
