import type {
  ScreeningDecision,
  ScreeningFinding,
  ScreeningReason,
  ScreeningResponse,
} from "@/lib/literature/screening/screening-types";

export class ScreeningValidator {
  validate(
    response: ScreeningResponse,
  ): ScreeningResponse {
    return {
      ...response,

      decision:
        this.validateDecision(
          response.decision,
        ),

      confidence:
        this.validateConfidence(
          response.confidence,
        ),

      reason:
        this.validateReason(
          response.reason,
        ),

      findings:
        this.validateFindings(
          response.findings,
        ),

      workflowStage:
        "SCREENING_COMPLETED",
    };
  }

  private validateDecision(
    decision: ScreeningDecision,
  ): ScreeningDecision {
    if (
      decision === "INCLUDE" ||
      decision === "EXCLUDE" ||
      decision === "REVIEW"
    ) {
      return decision;
    }

    return "REVIEW";
  }

  private validateConfidence(
    confidence: number,
  ): number {
    if (
      Number.isNaN(confidence)
    ) {
      return 0;
    }

    if (confidence < 0) {
      return 0;
    }

    if (confidence > 100) {
      return 100;
    }

    return confidence;
  }

  private validateReason(
    reason: ScreeningReason,
  ): ScreeningReason {
    const allowed: ScreeningReason[] = [
      "CASE_REPORT",
      "ADVERSE_EVENT",
      "PRODUCT_MENTION",
      "HUMAN_STUDY",
      "ANIMAL_STUDY",
      "REVIEW_ARTICLE",
      "NO_ADVERSE_EVENT",
      "NON_MEDICAL",
      "INSUFFICIENT_INFORMATION",
      "NON_ENGLISH",
      "DUPLICATE",
      "UNKNOWN",
    ];

    return allowed.includes(reason)
      ? reason
      : "UNKNOWN";
  }

  private validateFindings(
    findings: ScreeningFinding[],
  ): ScreeningFinding[] {
    if (
      !Array.isArray(findings)
    ) {
      return [];
    }

    return findings.map(
      (finding) => ({
        rule:
          finding.rule ??
          "Unknown Rule",

        passed:
          Boolean(
            finding.passed,
          ),

        score:
          Number.isFinite(
            finding.score,
          )
            ? Math.max(
                0,
                Math.min(
                  100,
                  finding.score,
                ),
              )
            : 0,

        comment:
          finding.comment ??
          "",
      }),
    );
  }
}

export const screeningValidator =
  new ScreeningValidator();