import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateCaseFinalization } from "../lib/safety/case-review/case-finalization-policy";
import type { CaseDraftPayload } from "../lib/safety/case-processing/case-processing-types";
import { deriveAllowedDispositions } from "../lib/safety/disposition/disposition-policy";

const migration = readFileSync(
  path.join(process.cwd(), "database/migrations/031_nexus_case_evidence_export.sql"),
  "utf8",
);
assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_case_evidence_packages").length - 1,
  1,
);
assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_case_exports").length - 1,
  1,
);
assert.equal(migration.includes("NEXUS_CASE_JSON"), true);
assert.equal(migration.includes("E2B_R3_MAPPING_JSON"), true);
assert.equal(migration.includes("HUMAN_READABLE_HTML"), true);
assert.equal(migration.includes("content_sha256"), true);

function baseDraft(options?: {
  serious?: boolean;
  reporter?: boolean;
  products?: number;
  events?: number;
}): CaseDraftPayload {
  const products = Array.from({ length: options?.products ?? 1 }, (_, index) => ({
    productKey: `P${index + 1}`,
    reportedName: `Drug ${index + 1}`,
    roleCharacterization: "SUSPECT" as const,
  }));
  const events = Array.from({ length: options?.events ?? 1 }, (_, index) => ({
    eventKey: `E${index + 1}`,
    reportedTerm: `Event ${index + 1}`,
    seriousness: options?.serious === true,
    seriousnessCriteria:
      options?.serious === true
        ? ({ LIFE_THREATENING: true } as Record<string, boolean>)
        : ({} as Record<string, boolean>),
  }));

  return {
    identification: {
      caseKey: "NXS-GOLDEN",
      reportType: "SPONTANEOUS",
      countryCode: "IN",
      initialReceiptDate: "2026-09-20",
      latestReceiptDate: "2026-09-20",
      seriousnessStatus: options?.serious ? "SERIOUS" : "NON_SERIOUS",
    },
    reporters:
      options?.reporter === false
        ? []
        : [
            {
              reporterKey: "REP-1",
              primarySource: true,
              qualification: "Physician",
              countryCode: "IN",
            },
          ],
    patient: { patientKey: "PAT-1", patientReference: "Patient 1" },
    products,
    events,
    tests: [],
    medicalHistory: [],
    additionalInformation: {},
  };
}

function assessmentsFor(draft: CaseDraftPayload) {
  return draft.products.flatMap((product) =>
    draft.events.flatMap((event) => [
      {
        productKey: product.productKey,
        eventKey: event.eventKey,
        assessmentType: "COMPANY_CAUSALITY",
        result: "Related",
      },
      {
        productKey: product.productKey,
        eventKey: event.eventKey,
        assessmentType: "EXPECTEDNESS",
        result: "Expected",
      },
    ]),
  );
}

function finalization(draft: CaseDraftPayload, options?: {
  openQueries?: number;
  qc?: boolean;
  mr?: boolean;
  assessments?: ReturnType<typeof assessmentsFor>;
}) {
  return evaluateCaseFinalization({
    draft,
    assessments: options?.assessments ?? assessmentsFor(draft),
    narrative: {
      narrativeVersion: 4,
      narrativeStage: "PROCESSOR",
      narrativeText:
        "Human-reviewed chronological case narrative suitable for controlled review.",
    },
    review: {
      openQueryCount: options?.openQueries ?? 0,
      qcApproved: options?.qc ?? true,
      medicalReviewApproved: options?.mr ?? true,
    },
  });
}

// Golden 1: valid spontaneous non-serious initial.
assert.equal(finalization(baseDraft()).ready, true);

// Golden 2: serious spontaneous with explicit seriousness criterion.
assert.equal(finalization(baseDraft({ serious: true })).ready, true);

// Golden 3: incomplete / missing reporter blocks finalization.
assert.equal(finalization(baseDraft({ reporter: false })).ready, false);

// Golden 4: confirmed duplicate can only take duplicate/hold disposition.
const duplicateDispositions = deriveAllowedDispositions(
  {
    validityStatus: "VALID",
    triageOutcome: "READY_FOR_DUPLICATE_REVIEW",
    followUpRequired: false,
    duplicateReviewStatus: "COMPLETE",
    caseRelationship: "DUPLICATE",
  },
  true,
);
assert.equal(duplicateDispositions.includes("DUPLICATE"), true);
assert.equal(duplicateDispositions.includes("CREATE_NEXUS_CASE"), false);

// Golden 5: follow-up routes to existing case / external handoff, not new case.
const followUpDispositions = deriveAllowedDispositions(
  {
    validityStatus: "VALID",
    triageOutcome: "READY_FOR_DUPLICATE_REVIEW",
    followUpRequired: false,
    duplicateReviewStatus: "COMPLETE",
    caseRelationship: "FOLLOW_UP",
  },
  true,
);
assert.equal(followUpDispositions.includes("FOLLOW_UP_EXISTING_CASE"), true);
assert.equal(followUpDispositions.includes("CREATE_NEXUS_CASE"), false);

// Golden 6: a literature-origin case uses the same governed finalization model.
const literatureDraft = baseDraft();
literatureDraft.identification.reportType = "LITERATURE";
literatureDraft.additionalInformation = {
  sourceType: "LITERATURE",
  pmid: "38912721",
};
assert.equal(finalization(literatureDraft).ready, true);

// Golden 7: multi-product/multi-event requires assessment coverage for every pair.
const multi = baseDraft({ products: 2, events: 2 });
const incompleteAssessments = assessmentsFor(multi).slice(0, 6);
assert.equal(
  finalization(multi, { assessments: incompleteAssessments }).ready,
  false,
);
assert.equal(finalization(multi).ready, true);

// Golden 8: QC return/open query blocks; corrected + QC/MR approved becomes ready.
const qcBlocked = finalization(baseDraft(), {
  openQueries: 1,
  qc: false,
  mr: false,
});
assert.equal(qcBlocked.ready, false);
const corrected = finalization(baseDraft(), {
  openQueries: 0,
  qc: true,
  mr: true,
});
assert.equal(corrected.ready, true);

const releaseService = readFileSync(
  path.join(process.cwd(), "lib/safety/case-release/case-release-service.ts"),
  "utf8",
);
assert.equal(releaseService.includes("rawSourceDocumentBytesIncluded: false"), true);
assert.equal(releaseService.includes("content_bytes"), false);
assert.equal(releaseService.includes("transmissionReady: false"), true);
assert.equal(releaseService.includes("not XML"), true);
assert.equal(releaseService.includes("fetch("), false);
assert.equal(releaseService.includes("axios"), false);
assert.equal(releaseService.includes("canonicalSha256(packagePayload)"), true);

for (const route of [
  "app/api/safety/cases/[caseId]/evidence/route.ts",
  "app/api/safety/cases/[caseId]/evidence/[packageId]/route.ts",
  "app/api/safety/cases/[caseId]/exports/route.ts",
  "app/api/safety/cases/[caseId]/exports/[exportId]/route.ts",
]) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("NEXUS_MODULES.CASE_PROCESSING"), true);
  assert.equal(source.includes("requireModulePermission"), true);
  assert.equal(source.includes("PERMISSIONS.CASE_EXPORT") || source.includes("PERMISSIONS.CASE_VIEW"), true);
}

const navigation = readFileSync(
  path.join(process.cwd(), "components/Navigation.tsx"),
  "utf8",
);
assert.equal(navigation.includes('moduleKey: "CASE_PROCESSING"'), true);

const workspace = readFileSync(
  path.join(process.cwd(), "app/cases/[caseId]/case-workspace-client.tsx"),
  "utf8",
);
assert.equal(workspace.includes('"Evidence & Export"'), true);
assert.equal(workspace.includes("Generate Case Evidence Package"), true);
assert.equal(workspace.includes("Generate E2B(R3) Mapping JSON"), true);
assert.equal(workspace.includes("regulatory XML transmission"), true);
assert.equal(workspace.includes("gateway acknowledgement workflow"), true);

const migrationRegistry = readFileSync(
  path.join(process.cwd(), "lib/database/migration-registry.ts"),
  "utf8",
);
for (const id of ["029", "030", "031"]) {
  assert.equal(migrationRegistry.includes(`id: "${id}"`), true);
}

// Direct URL/API security remains module + RBAC gated.
for (const route of [
  "app/api/safety/cases/[caseId]/route.ts",
  "app/api/safety/cases/[caseId]/reviews/qc/route.ts",
  "app/api/safety/cases/[caseId]/reviews/medical/route.ts",
  "app/api/safety/cases/[caseId]/finalization/route.ts",
  "app/api/safety/cases/[caseId]/exports/route.ts",
]) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("requireModulePermission"), true);
  assert.equal(source.includes("NEXUS_MODULES.CASE_PROCESSING"), true);
}

const releaseChecklist = readFileSync(
  path.join(process.cwd(), "lib/release/release-checklist.ts"),
  "utf8",
);
assert.equal(releaseChecklist.includes("Required migrations 001-032"), true);
assert.equal(releaseChecklist.includes("Nexus safety-workflow scenarios"), true);

const uatCatalog = readFileSync(
  path.join(process.cwd(), "lib/release/uat-catalog.ts"),
  "utf8",
);
for (const id of [
  "UAT-NEXUS-001",
  "UAT-NEXUS-002",
  "UAT-NEXUS-003",
  "UAT-NEXUS-004",
  "UAT-NEXUS-005",
  "UAT-NEXUS-006",
]) {
  assert.equal(uatCatalog.includes(`"${id}"`), true, `Missing Nexus UAT scenario ${id}`);
}

const releaseManifest = readFileSync(
  path.join(process.cwd(), "lib/release/release-manifest.ts"),
  "utf8",
);
assert.equal(releaseManifest.includes("L2A Nexus Case Processing"), true);
assert.equal(releaseManifest.includes("QC and Medical Review"), true);
assert.equal(releaseManifest.includes("Regulatory gateway transmission and acknowledgement handling"), true);
assert.equal(releaseManifest.includes("PV Nexus case-management functions"), false);

const releaseSelfTest = readFileSync(
  path.join(process.cwd(), "lib/release/release-self-test.ts"),
  "utf8",
);
assert.equal(releaseSelfTest.includes('manifest.excludedCapabilities.includes("Intake workspace")'), false);
assert.equal(releaseSelfTest.includes('manifest.includedCapabilities.includes("L2A Nexus Case Processing")'), true);
assert.equal(releaseSelfTest.includes('"mandatory-pv-and-nexus-uat-present"'), true);

const releaseRunbook = readFileSync(
  path.join(process.cwd(), "deployment/PRODUCTION_RELEASE_RUNBOOK.md"),
  "utf8",
);
assert.equal(releaseRunbook.includes("migrations `001` through `032`"), true);
assert.equal(releaseRunbook.includes("Literature → Intake"), true);
assert.equal(releaseRunbook.includes("validated regional E2B XML transmission"), false);

console.log("Nexus Sprint 10 evidence/export/release and eight golden cases verification passed.");
