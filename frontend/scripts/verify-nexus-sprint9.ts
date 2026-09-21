import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateCaseFinalization } from "../lib/safety/case-review/case-finalization-policy";
import type { CaseDraftPayload } from "../lib/safety/case-processing/case-processing-types";

const migration = readFileSync(
  path.join(process.cwd(), "database/migrations/029_nexus_case_review_finalization.sql"),
  "utf8",
);

for (const table of [
  "safety_case_review_actions",
  "safety_case_queries",
  "safety_case_finalization_checks",
]) {
  assert.equal(
    migration.split(`CREATE TABLE IF NOT EXISTS ${table}`).length - 1,
    1,
    `Migration 029 must define ${table} exactly once.`,
  );
}
assert.equal(migration.includes("safety_case_review_actions_immutable"), true);
assert.equal(migration.includes("safety_case_finalization_checks_immutable"), true);
assert.equal(migration.includes("'QC'"), true);
assert.equal(migration.includes("'MEDICAL_REVIEW'"), true);
assert.equal(migration.includes("'FINALIZE'"), true);

const baseDraft: CaseDraftPayload = {
  identification: {
    caseKey: "NXS-CASE-READY",
    reportType: "SPONTANEOUS",
    countryCode: "IN",
    initialReceiptDate: "2026-09-20",
    latestReceiptDate: "2026-09-20",
    seriousnessStatus: "NON_SERIOUS",
  },
  reporters: [
    {
      reporterKey: "REP-1",
      primarySource: true,
      qualification: "Consumer",
      countryCode: "IN",
    },
  ],
  patient: {
    patientKey: "PAT-1",
    patientReference: "Patient 1",
  },
  products: [
    {
      productKey: "P1",
      reportedName: "Drug A",
      roleCharacterization: "SUSPECT",
    },
  ],
  events: [
    {
      eventKey: "E1",
      reportedTerm: "Headache",
      seriousness: false,
    },
  ],
  tests: [],
  medicalHistory: [],
  additionalInformation: {},
};

const ready = evaluateCaseFinalization({
  draft: baseDraft,
  assessments: [
    {
      productKey: "P1",
      eventKey: "E1",
      assessmentType: "COMPANY_CAUSALITY",
      result: "Related",
    },
    {
      productKey: "P1",
      eventKey: "E1",
      assessmentType: "EXPECTEDNESS",
      result: "Expected",
    },
  ],
  narrative: {
    narrativeVersion: 2,
    narrativeStage: "PROCESSOR",
    narrativeText: "Human-reviewed case narrative containing sufficient case facts.",
  },
  review: {
    qcApproved: true,
    medicalReviewApproved: true,
    openQueryCount: 0,
  },
});
assert.equal(ready.ready, true);

const noReporter = evaluateCaseFinalization({
  draft: { ...baseDraft, reporters: [] },
  assessments: [
    { productKey: "P1", eventKey: "E1", assessmentType: "COMPANY_CAUSALITY", result: "Related" },
    { productKey: "P1", eventKey: "E1", assessmentType: "EXPECTEDNESS", result: "Expected" },
  ],
  narrative: {
    narrativeVersion: 2,
    narrativeStage: "PROCESSOR",
    narrativeText: "Human-reviewed case narrative containing sufficient case facts.",
  },
  review: { qcApproved: true, medicalReviewApproved: true, openQueryCount: 0 },
});
assert.equal(noReporter.ready, false);
assert.equal(noReporter.checks.find((c) => c.key === "REPORTER_PRESENT")?.passed, false);

const openQuery = evaluateCaseFinalization({
  draft: baseDraft,
  assessments: [
    { productKey: "P1", eventKey: "E1", assessmentType: "COMPANY_CAUSALITY", result: "Related" },
    { productKey: "P1", eventKey: "E1", assessmentType: "EXPECTEDNESS", result: "Expected" },
  ],
  narrative: {
    narrativeVersion: 2,
    narrativeStage: "PROCESSOR",
    narrativeText: "Human-reviewed case narrative containing sufficient case facts.",
  },
  review: { qcApproved: true, medicalReviewApproved: true, openQueryCount: 1 },
});
assert.equal(openQuery.ready, false);
assert.equal(openQuery.checks.find((c) => c.key === "NO_OPEN_QUERIES")?.passed, false);

const service = readFileSync(
  path.join(process.cwd(), "lib/safety/case-review/case-review-service.ts"),
  "utf8",
);
assert.equal(service.includes("draft_revision = $4"), true);
assert.equal(service.includes("Current draft revision does not have a matching QC approval."), true);
assert.equal(service.includes("createSafetyCaseVersionInTransaction"), true);
assert.equal(service.includes("case_status = 'FINAL'"), true);
assert.equal(service.includes("previewCaseFinalization"), true);
assert.equal(service.includes("stage: \"QC\""), true);
assert.equal(service.includes("stage: \"MEDICAL_REVIEW\""), true);

const narrativeRoute = readFileSync(
  path.join(process.cwd(), "app/api/safety/cases/[caseId]/narratives/route.ts"),
  "utf8",
);
assert.equal(narrativeRoute.includes('narrativeStage: "PROCESSOR"'), true);
assert.equal(narrativeRoute.includes('narrativeStage: "FINAL"'), false);

for (const [route, permission] of [
  ["app/api/safety/cases/[caseId]/reviews/qc/route.ts", "CASE_QC"],
  ["app/api/safety/cases/[caseId]/reviews/medical/route.ts", "CASE_MEDICAL_REVIEW"],
  ["app/api/safety/cases/[caseId]/finalization/route.ts", "CASE_FINALIZE"],
] as const) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("NEXUS_MODULES.CASE_PROCESSING"), true);
  assert.equal(source.includes(`PERMISSIONS.${permission}`), true);
}

const finalizationRoute = readFileSync(
  path.join(process.cwd(), "app/api/safety/cases/[caseId]/finalization/route.ts"),
  "utf8",
);
assert.equal(finalizationRoute.includes("previewCaseFinalization"), true);
assert.equal(finalizationRoute.includes("runCaseFinalizationCheck({ principal, caseId })"), false);

console.log("Nexus Sprint 9 QC, Medical Review and finalization verification passed.");
