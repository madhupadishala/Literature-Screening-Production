import type { CaseDraftPayload } from "../case-processing/case-processing-types";

export interface FinalizationAssessmentSnapshot {
  productKey: string;
  eventKey: string;
  assessmentType: string;
  result: string;
}

export interface FinalizationNarrativeSnapshot {
  narrativeVersion: number;
  narrativeStage: string;
  narrativeText: string;
}

export interface FinalizationReviewSnapshot {
  qcApproved: boolean;
  medicalReviewApproved: boolean;
  openQueryCount: number;
}

export interface FinalizationCheck {
  key: string;
  passed: boolean;
  message: string;
}

export interface FinalizationEvaluation {
  ready: boolean;
  checks: FinalizationCheck[];
}

function hasAssessment(
  assessments: FinalizationAssessmentSnapshot[],
  productKey: string,
  eventKey: string,
  types: string[],
): boolean {
  return assessments.some(
    (item) =>
      item.productKey === productKey &&
      item.eventKey === eventKey &&
      types.includes(item.assessmentType) &&
      item.result.trim().length > 0,
  );
}

export function evaluateCaseFinalization(input: {
  draft: CaseDraftPayload;
  assessments: FinalizationAssessmentSnapshot[];
  narrative: FinalizationNarrativeSnapshot | null;
  review: FinalizationReviewSnapshot;
}): FinalizationEvaluation {
  const checks: FinalizationCheck[] = [];

  checks.push({
    key: "PATIENT_PRESENT",
    passed: Boolean(input.draft.patient?.patientKey?.trim()),
    message: "An identifiable case patient is present.",
  });

  checks.push({
    key: "REPORTER_PRESENT",
    passed: Array.isArray(input.draft.reporters) && input.draft.reporters.length > 0,
    message: "At least one reporter is present.",
  });

  checks.push({
    key: "PRODUCT_PRESENT",
    passed: Array.isArray(input.draft.products) && input.draft.products.length > 0,
    message: "At least one product is present.",
  });

  checks.push({
    key: "EVENT_PRESENT",
    passed: Array.isArray(input.draft.events) && input.draft.events.length > 0,
    message: "At least one event/reaction is present.",
  });

  const chronologyPassed = input.draft.events.every((event) => {
    if (!event.onsetDate || !event.endDate) return true;
    return new Date(event.endDate).getTime() >= new Date(event.onsetDate).getTime();
  });
  checks.push({
    key: "EVENT_CHRONOLOGY",
    passed: chronologyPassed,
    message: "Event chronology contains no end-before-onset contradiction.",
  });

  const seriousnessResolved =
    input.draft.identification.seriousnessStatus !== "UNRESOLVED";
  checks.push({
    key: "SERIOUSNESS_RESOLVED",
    passed: seriousnessResolved,
    message: "Case seriousness is resolved before finalization.",
  });

  if (input.draft.identification.seriousnessStatus === "SERIOUS") {
    const hasSeriousCriterion = input.draft.events.some(
      (event) =>
        event.seriousness === true &&
        Object.values(event.seriousnessCriteria ?? {}).some(Boolean),
    );
    checks.push({
      key: "SERIOUSNESS_CRITERION",
      passed: hasSeriousCriterion,
      message: "A serious case contains at least one recorded seriousness criterion.",
    });
  }

  const relevantProducts = input.draft.products.filter((product) =>
    ["SUSPECT", "INTERACTING"].includes(product.roleCharacterization),
  );

  const assessmentPairs = relevantProducts.flatMap((product) =>
    input.draft.events.map((event) => ({ product, event })),
  );

  const causalityComplete = assessmentPairs.every(({ product, event }) =>
    hasAssessment(
      input.assessments,
      product.productKey,
      event.eventKey,
      ["COMPANY_CAUSALITY", "CAUSALITY"],
    ),
  );
  checks.push({
    key: "CAUSALITY_ASSESSED",
    passed: causalityComplete,
    message:
      "Each suspect/interacting product-event pair has a human causality assessment.",
  });

  const expectednessComplete = assessmentPairs.every(({ product, event }) =>
    hasAssessment(
      input.assessments,
      product.productKey,
      event.eventKey,
      ["EXPECTEDNESS", "LISTEDNESS"],
    ),
  );
  checks.push({
    key: "EXPECTEDNESS_ASSESSED",
    passed: expectednessComplete,
    message:
      "Each suspect/interacting product-event pair has expectedness/listedness assessment.",
  });

  checks.push({
    key: "NARRATIVE_PRESENT",
    passed: Boolean(
      input.narrative && input.narrative.narrativeText.trim().length >= 10,
    ),
    message: "A current processor/QC/medical narrative is present.",
  });

  checks.push({
    key: "NO_OPEN_QUERIES",
    passed: input.review.openQueryCount === 0,
    message: "No unresolved QC or Medical Review query remains open.",
  });

  checks.push({
    key: "QC_APPROVED",
    passed: input.review.qcApproved,
    message: "QC approval has been recorded for the current review cycle.",
  });

  checks.push({
    key: "MEDICAL_REVIEW_APPROVED",
    passed: input.review.medicalReviewApproved,
    message: "Medical Review approval has been recorded.",
  });

  return {
    ready: checks.every((check) => check.passed),
    checks,
  };
}
