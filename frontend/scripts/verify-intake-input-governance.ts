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
const completeReviewGate = {
  reviewWorkspaceStatus: "REVIEW_COMPLETE",
  patientSegmentationStatus: "COMPLETE",
  labelingStatus: "COMPLETE",
  causalityStatus: "COMPLETE",
  mrReviewStatus: "APPROVED",
} as const;
assert.equal(
  extractCompanyAssessmentsFromScreeningPayload({
    result: { companySuspectAssessments: [companyAssessment] },
  }).length,
  1,
);

assert.doesNotThrow(() =>
  assertIntakeGenerationGate({
    workflowState: "REVIEW_COMPLETE",
    screeningReviewStatus: "approved",
    screeningFinalDecision: "INCLUDE",
    hitsReviewStatus: "approved",
    hitsReviewDecision: "accept_ai",
    companyAssessments: [companyAssessment],
    ...completeReviewGate,
  }),
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "REVIEW_COMPLETE",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: null,
      hitsReviewDecision: null,
      companyAssessments: [companyAssessment],
      ...completeReviewGate,
    }),
  /completed human Hits review/i,
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "REVIEW_COMPLETE",
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
      ...completeReviewGate,
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
      ...completeReviewGate,
    }),
  /workflow state/i,
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "SCREENING_COMPLETE",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: "approved",
      hitsReviewDecision: "accept_ai",
      companyAssessments: [companyAssessment],
      ...completeReviewGate,
    }),
  /Review \/ MR must be completed first/i,
);

assert.throws(
  () =>
    assertIntakeGenerationGate({
      workflowState: "REVIEW_COMPLETE",
      screeningReviewStatus: "approved",
      screeningFinalDecision: "INCLUDE",
      hitsReviewStatus: "approved",
      hitsReviewDecision: "accept_ai",
      companyAssessments: [companyAssessment],
      ...completeReviewGate,
      mrReviewStatus: "PENDING",
    }),
  /completed patient segmentation.*Medical Review decision/i,
);

console.log("Sprint 4 Screening → Review\/MR → Intake governance verification passed.");
