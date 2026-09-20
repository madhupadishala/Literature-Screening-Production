import type { CompanySuspectAssessment } from "@/lib/pharmaceutical-intelligence/types";
import type {
  IcsrCriteriaAssessment,
  PatientSafetyAssessment,
} from "@/lib/pv-decision-intelligence/types";
import type { ScreeningDecision } from "./screening-types";

export interface GovernedScreeningDecisionInput {
  aiDecision: ScreeningDecision;
  patientSafety: PatientSafetyAssessment;
  icsr: IcsrCriteriaAssessment;
  companyAssessments: CompanySuspectAssessment[];
}

export interface FinalIncludeEligibility {
  eligible: boolean;
  reason: string;
}

export function hasConfirmedActiveCompanyProduct(
  assessments: CompanySuspectAssessment[],
): boolean {
  return assessments.some(
    (assessment) =>
      assessment.companySuspect === true &&
      assessment.licenceStatus === "ACTIVE" &&
      assessment.conclusion === "CONFIRMED" &&
      assessment.manualReviewRequired === false,
  );
}

export function hasResolvedNegativeCompanyApplicability(
  assessments: CompanySuspectAssessment[],
): boolean {
  return (
    assessments.length > 0 &&
    assessments.every(
      (assessment) =>
        assessment.manualReviewRequired === false &&
        assessment.companySuspect === false,
    )
  );
}

export function deriveGovernedScreeningDecision(
  input: GovernedScreeningDecisionInput,
): ScreeningDecision {
  if (input.patientSafety.relevance === "NOT_RELEVANT") {
    return "EXCLUDE";
  }

  if (
    input.patientSafety.manualReviewRequired ||
    input.icsr.manualReviewRequired ||
    input.companyAssessments.some((assessment) => assessment.manualReviewRequired)
  ) {
    return "REVIEW";
  }

  if (hasResolvedNegativeCompanyApplicability(input.companyAssessments)) {
    return "EXCLUDE";
  }

  if (hasConfirmedActiveCompanyProduct(input.companyAssessments)) {
    return input.aiDecision;
  }

  return "REVIEW";
}

export function finalIncludeEligibility(
  assessments: CompanySuspectAssessment[],
): FinalIncludeEligibility {
  if (assessments.length === 0) {
    return {
      eligible: false,
      reason:
        "No governed company-product assessment exists for this Screening result.",
    };
  }

  if (assessments.some((assessment) => assessment.manualReviewRequired)) {
    return {
      eligible: false,
      reason:
        "Company-product or MAH applicability remains under mandatory review.",
    };
  }

  if (!hasConfirmedActiveCompanyProduct(assessments)) {
    return {
      eligible: false,
      reason:
        "No active company product/MAH is confirmed by the governed Product Master.",
    };
  }

  return {
    eligible: true,
    reason: "An active company product/MAH is confirmed by governed Product Master data.",
  };
}
