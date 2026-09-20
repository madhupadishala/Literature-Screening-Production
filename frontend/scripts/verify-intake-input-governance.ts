import assert from "node:assert/strict";

import type { CompanySuspectAssessment } from "../lib/pharmaceutical-intelligence/types";
import {
  assertIntakeGenerationGate,
  extractCompanyAssessmentsFromScreeningPayload,
  validateIntakeGenerationReason,
} from "../lib/literature/intake-input/intake-input-governance";

function confirmedAssessment(): CompanySuspectAssessment {
  return {
    assessmentId: "assessment-1",
    knowledgeVersion: "product-master-test-v1",
    reportedProduct: "Test Product",
    relationship: "EXACT_NAME",
    candidates: [],
    productMatched: true,
    presentationMatched: true,
    countryOfInterest: "IN",
    licenceStatus: "ACTIVE",
    companySuspect: true,
    conclusion: "CONFIRMED",
    specialSituationReviewRequired: false,
    manualReviewRequired: false,
    appliedScenarioIds: [],
    prohibitedConclusions: [],
    decisionTrail: [],
    reportedRole: "SUSPECT",
    roleSupportsSuspicion: true,
  };
}

const reason = validateIntakeGenerationReason(
  "Generate governed intake input after completed human review and lineage verification.",
);
assert.ok(reason.includes("lineage verification"));

assert.throws(
  () => validateIntakeGenerationReason("Not applicable"),
  /specific audit reason|Generic reasons/i,
);
assert.throws(
  () => validateIntakeGenerationReason("testing"),
  /specific audit reason|Generic reasons/i,
);

const companyAssessment = confirmedAssessment();
assert.equal(
  extractCompanyAssessmentsFromScreeningPayload({
    result: { companySuspectAssessments: [companyAssessment] },
  }).length,
  1,
);

assert.doesNotThrow(() =>
  assertIntakeGenerationGate({
    workflowState: "SCREENING_COMPLETE",
    screeningReviewStatus: "approved",
    screeningFinalDecision: "INCLUDE",
    hitsReviewStatus: "approved",
    hitsReviewDecision: "accept_ai",
    companyAssessments: [companyAssessment],
  }),
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "SCREENING_COMPLETE",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: null,
      hitsReviewDecision: null,
      companyAssessments: [companyAssessment],
    }),
  /completed human Hits review/i,
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "SCREENING_COMPLETE",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: "approved",
      hitsReviewDecision: "accept_ai",
      companyAssessments: [
        {
          ...companyAssessment,
          licenceStatus: "UNRESOLVED",
          companySuspect: null,
          conclusion: "UNRESOLVED",
          manualReviewRequired: true,
        },
      ],
    }),
  /cannot be generated/i,
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "SCREENING_REVIEW",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: "approved",
      hitsReviewDecision: "accept_ai",
      companyAssessments: [companyAssessment],
    }),
  /workflow state/i,
);

console.log("Sprint 4 intake-input governance verification passed.");
