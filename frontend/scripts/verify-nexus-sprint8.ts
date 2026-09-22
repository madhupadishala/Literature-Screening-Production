import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateCaseAssist } from "../lib/safety/case-processing/case-assist";
import type { CaseDraftPayload } from "../lib/safety/case-processing/case-processing-types";

const migration = readFileSync(
  path.join(process.cwd(), "database/migrations/029_nexus_l2a_case_processing.sql"),
  "utf8",
);

for (const table of [
  "safety_case_draft_versions",
  "safety_case_assessments",
  "safety_case_narrative_versions",
  "safety_case_assist_suggestions",
  "safety_case_followup_links",
]) {
  assert.equal(
    migration.split(`CREATE TABLE IF NOT EXISTS ${table}`).length - 1,
    1,
    `Migration 029 must define ${table} exactly once.`,
  );
}

assert.equal(migration.includes("current_draft_revision"), true);
assert.equal(migration.includes("'NEW'"), true);
assert.equal(migration.includes("'READY_FOR_QC'"), true);
assert.equal(migration.includes("'QC_RETURNED'"), true);
assert.equal(migration.includes("'QC_APPROVED'"), true);
assert.equal(migration.includes("safety_case_drafts_immutable"), true);
assert.equal(migration.includes("safety_case_assessments_immutable"), true);
assert.equal(migration.includes("safety_case_narratives_immutable"), true);

const draft: CaseDraftPayload = {
  identification: {
    caseKey: "NXS-CASE-001",
    reportType: "SPONTANEOUS",
    countryCode: "IN",
    initialReceiptDate: "2026-09-20",
    latestReceiptDate: "2026-09-20",
    seriousnessStatus: "SERIOUS",
    expeditedReportingRequired: null,
  },
  reporters: [
    {
      reporterKey: "REP-1",
      primarySource: true,
      qualification: "Physician",
      countryCode: "IN",
    },
  ],
  patient: {
    patientKey: "PAT-1",
    patientReference: "Patient A",
    ageValue: 42,
    ageUnit: "year",
    sex: "FEMALE",
  },
  products: [
    {
      productKey: "PROD-1",
      reportedName: "Example Drug",
      roleCharacterization: "SUSPECT",
    },
  ],
  events: [
    {
      eventKey: "EVT-1",
      reportedTerm: "Anaphylaxis",
      onsetDate: "2026-09-19T10:00:00.000Z",
      seriousness: true,
      seriousnessCriteria: { LIFE_THREATENING: true },
    },
  ],
  tests: [],
  medicalHistory: [],
  additionalInformation: {},
};

const suggestions = evaluateCaseAssist(draft);
assert.equal(
  suggestions.some((item) => item.suggestionType === "SERIOUSNESS_SUPPORT"),
  true,
);
assert.equal(
  suggestions.some((item) => item.suggestionType === "CAUSALITY_SUPPORT"),
  true,
);
assert.equal(
  suggestions.some((item) => item.suggestionType === "EXPECTEDNESS_SUPPORT"),
  true,
);
const coding = suggestions.find((item) => item.suggestionType === "CODING_REVIEW");
assert.ok(coding);
assert.equal(coding.payload.status, "LICENSED_DICTIONARY_REQUIRED");
assert.equal(coding.evidence.proprietaryDictionaryUsed, false);
assert.equal(JSON.stringify(coding).includes('"meddraCode"'), false);

const narrative = suggestions.find(
  (item) => item.suggestionType === "NARRATIVE_DRAFT",
);
assert.ok(narrative);
assert.equal(
  String(narrative.payload.generationMode),
  "DETERMINISTIC_STRUCTURED_FACTS",
);

const processingService = readFileSync(
  path.join(
    process.cwd(),
    "lib/safety/case-processing/case-processing-service.ts",
  ),
  "utf8",
);
assert.equal(processingService.includes("safety_case_draft_versions"), true);
assert.equal(processingService.includes("current_draft_revision"), true);
assert.equal(processingService.includes("INTAKE_SEED"), true);
assert.equal(processingService.includes("CASE_DRAFT_SAVED"), true);
assert.equal(processingService.includes("UPDATE safety_intake_records"), false);
assert.equal(processingService.includes("dateValue("), true);

const safetyCaseService = readFileSync(
  path.join(process.cwd(), "lib/safety/common/safety-case-service.ts"),
  "utf8",
);
assert.equal(safetyCaseService.includes("'NEW'"), true);
assert.equal(safetyCaseService.includes("'CASE_PROCESSING','OPEN'"), true);

for (const [route, permission] of [
  ["app/api/safety/cases/route.ts", "CASE_VIEW"],
  ["app/api/safety/cases/[caseId]/route.ts", "CASE_PROCESS"],
  ["app/api/safety/cases/[caseId]/assignment/route.ts", "CASE_ASSIGN"],
  ["app/api/safety/cases/[caseId]/assessments/route.ts", "CASE_PROCESS"],
  ["app/api/safety/cases/[caseId]/narratives/route.ts", "CASE_PROCESS"],
] as const) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("NEXUS_MODULES.CASE_PROCESSING"), true);
  assert.equal(source.includes(`PERMISSIONS.${permission}`), true);
  assert.equal(source.includes("requireModulePermission"), true);
}

const workspace = readFileSync(
  path.join(process.cwd(), "app/cases/[caseId]/case-workspace-client.tsx"),
  "utf8",
);
for (const tab of [
  "General",
  "Reporter",
  "Patient",
  "Events",
  "Products",
  "Medical History",
  "Labs",
  "Assessments",
  "Narrative",
  "Attachments",
  "Reviews",
  "Audit",
]) {
  assert.equal(workspace.includes(`"${tab}"`), true, `Missing case tab ${tab}`);
}
assert.equal(workspace.includes("Save new case draft revision"), true);
assert.equal(workspace.includes("Record human assessment"), true);
assert.equal(workspace.includes("Save human PROCESSOR version"), true);

const navigation = readFileSync(
  path.join(process.cwd(), "components/Navigation.tsx"),
  "utf8",
);
assert.equal(
  navigation.includes(
    '{ label: "Cases", path: "/cases", moduleKey: "CASE_PROCESSING" }',
  ),
  true,
);

const disposition = readFileSync(
  path.join(process.cwd(), "lib/safety/disposition/disposition-service.ts"),
  "utf8",
);
assert.equal(disposition.includes("safety_case_followup_links"), true);
assert.equal(disposition.includes("case-followup-processing:"), true);

console.log("Nexus Sprint 8 L2A case processing verification passed.");
