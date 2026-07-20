import type {
  ScreeningRequest,
  ScreeningResponse,
  ScreeningFinding,
  ScreeningDecision,
  ScreeningReason,
} from "./screening-types";

class ScreeningEngine {
  screen(
    request: ScreeningRequest,
  ): ScreeningResponse {
    const findings: ScreeningFinding[] = [];

    const text = (
      request.article.title +
      " " +
      (request.article.abstract ?? "")
    ).toLowerCase();

    let score = 0;

    //----------------------------------------
    // Rule 1
    //----------------------------------------

    const hasCaseReport =
      text.includes("case report") ||
      text.includes("case series");

    findings.push({
      rule: "Case Report",
      passed: hasCaseReport,
      score: hasCaseReport ? 20 : 0,
      comment: hasCaseReport
        ? "Case report detected."
        : "No case report identified.",
    });

    if (hasCaseReport) score += 20;

    //----------------------------------------
    // Rule 2
    //----------------------------------------

    const hasAdverseEvent =
      text.includes("adverse") ||
      text.includes("side effect") ||
      text.includes("toxicity") ||
      text.includes("reaction");

    findings.push({
      rule: "Adverse Event",
      passed: hasAdverseEvent,
      score: hasAdverseEvent ? 25 : 0,
      comment: hasAdverseEvent
        ? "Adverse event identified."
        : "No adverse event found.",
    });

    if (hasAdverseEvent) score += 25;

    //----------------------------------------
    // Rule 3
    //----------------------------------------

    const hasProduct =
      text.includes("drug") ||
      text.includes("tablet") ||
      text.includes("capsule") ||
      text.includes("vaccine") ||
      text.includes("medicine");

    findings.push({
      rule: "Product Mention",
      passed: hasProduct,
      score: hasProduct ? 20 : 0,
      comment: hasProduct
        ? "Medicinal product detected."
        : "No medicinal product identified.",
    });

    if (hasProduct) score += 20;

    //----------------------------------------
    // Rule 4
    //----------------------------------------

    const humanStudy =
      !text.includes("rat") &&
      !text.includes("mouse") &&
      !text.includes("animal");

    findings.push({
      rule: "Human Study",
      passed: humanStudy,
      score: humanStudy ? 15 : 0,
      comment: humanStudy
        ? "Appears to be a human study."
        : "Animal study detected.",
    });

    if (humanStudy) score += 15;

    //----------------------------------------
    // Rule 5
    //----------------------------------------

    const reviewArticle =
      text.includes("systematic review") ||
      text.includes("meta analysis") ||
      text.includes("meta-analysis");

    findings.push({
      rule: "Review Article",
      passed: !reviewArticle,
      score: reviewArticle ? -20 : 10,
      comment: reviewArticle
        ? "Review article detected."
        : "Primary publication.",
    });

    if (!reviewArticle)
      score += 10;
    else
      score -= 20;

    //----------------------------------------
    // Final Decision
    //----------------------------------------

    let decision: ScreeningDecision;
    let reason: ScreeningReason;

    if (score >= 60) {
      decision = "INCLUDE";
      reason = "CASE_REPORT";
    } else if (score >= 35) {
      decision = "REVIEW";
      reason = "INSUFFICIENT_INFORMATION";
    } else {
      decision = "EXCLUDE";
      reason = "NO_ADVERSE_EVENT";
    }

    return {
      tenantId: request.tenantId,

      pmid: request.article.pmid,

      decision,

      confidence: Math.min(score, 100),

      reason,

      findings,

      screenedAt: new Date().toISOString(),

      workflowStage: "SCREENING_COMPLETED",
    };
  }
}

export const screeningEngine =
  new ScreeningEngine();