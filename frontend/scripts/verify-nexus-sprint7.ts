import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { deriveAllowedDispositions } from "../lib/safety/disposition/disposition-policy";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "database/migrations/027_nexus_intake_disposition.sql",
  ),
  "utf8",
);

for (const table of [
  "safety_intake_dispositions",
  "safety_external_handoff_packages",
]) {
  assert.equal(
    migration.split(`CREATE TABLE IF NOT EXISTS ${table}`).length - 1,
    1,
    `Migration 027 must define ${table} exactly once.`,
  );
}

assert.equal(migration.includes("'ON_HOLD'"), true);
assert.equal(migration.includes("'READY_FOR_DISPOSITION'"), true);
assert.equal(migration.includes("'CREATE_NEXUS_CASE'"), true);
assert.equal(migration.includes("'EXPORT_EXTERNAL'"), true);
assert.equal(migration.includes("payload_sha256"), true);

const validNew = {
  validityStatus: "VALID",
  triageOutcome: "READY_FOR_DUPLICATE_REVIEW",
  followUpRequired: false,
  duplicateReviewStatus: "COMPLETE",
  caseRelationship: "NEW_CASE",
};

const withCaseModule = deriveAllowedDispositions(validNew, true);
assert.equal(withCaseModule.includes("CREATE_NEXUS_CASE"), true);
assert.equal(withCaseModule.includes("EXPORT_EXTERNAL"), true);
assert.equal(withCaseModule.includes("HOLD"), true);

const withoutCaseModule = deriveAllowedDispositions(validNew, false);
assert.equal(withoutCaseModule.includes("CREATE_NEXUS_CASE"), false);
assert.equal(withoutCaseModule.includes("EXPORT_EXTERNAL"), true);

const followUp = deriveAllowedDispositions(
  { ...validNew, caseRelationship: "FOLLOW_UP" },
  true,
);
assert.equal(followUp.includes("FOLLOW_UP_EXISTING_CASE"), true);
assert.equal(followUp.includes("EXPORT_EXTERNAL"), true);
assert.equal(followUp.includes("CREATE_NEXUS_CASE"), false);

const duplicate = deriveAllowedDispositions(
  { ...validNew, caseRelationship: "DUPLICATE" },
  true,
);
assert.equal(duplicate.includes("DUPLICATE"), true);
assert.equal(duplicate.includes("CREATE_NEXUS_CASE"), false);

const invalid = deriveAllowedDispositions(
  {
    validityStatus: "INVALID",
    triageOutcome: "NOT_VALID_ICSR",
    followUpRequired: false,
    duplicateReviewStatus: "NOT_STARTED",
    caseRelationship: "",
  },
  true,
);
assert.equal(invalid.includes("NON_CASE"), true);
assert.equal(invalid.includes("CREATE_NEXUS_CASE"), false);

const incomplete = deriveAllowedDispositions(
  {
    validityStatus: "UNRESOLVED",
    triageOutcome: "FOLLOW_UP_REQUIRED",
    followUpRequired: true,
    duplicateReviewStatus: "NOT_STARTED",
    caseRelationship: "",
  },
  false,
);
assert.equal(incomplete.includes("INCOMPLETE_FOLLOW_UP"), true);
assert.equal(incomplete.includes("HOLD"), true);

const service = readFileSync(
  path.join(process.cwd(), "lib/safety/disposition/disposition-service.ts"),
  "utf8",
);
assert.equal(service.includes("moduleIsEffectivelyEnabled"), true);
assert.equal(service.includes("createSafetyCaseShellInTransaction"), true);
assert.equal(service.includes("rawSourceBytesIncluded: false"), true);
assert.equal(service.includes("canonicalSha256(payload)"), true);
assert.equal(service.includes('"ON_HOLD"'), true);
assert.equal(service.includes("destinationSystem is required"), true);
assert.equal(service.includes("fetch("), false);
assert.equal(service.includes("axios"), false);

const caseService = readFileSync(
  path.join(process.cwd(), "lib/safety/common/safety-case-service.ts"),
  "utf8",
);
assert.equal(
  caseService.includes("createSafetyCaseShellInTransaction"),
  true,
);

const dispositionRoute = readFileSync(
  path.join(
    process.cwd(),
    "app/api/safety/intake/[intakeId]/disposition/route.ts",
  ),
  "utf8",
);
assert.equal(dispositionRoute.includes("PERMISSIONS.CASE_CREATE"), true);
assert.equal(dispositionRoute.includes("PERMISSIONS.INTAKE_EXPORT"), true);
assert.equal(dispositionRoute.includes("NEXUS_MODULES.CASE_PROCESSING"), true);

const handoffRoute = readFileSync(
  path.join(
    process.cwd(),
    "app/api/safety/intake/[intakeId]/handoffs/[packageId]/route.ts",
  ),
  "utf8",
);
assert.equal(handoffRoute.includes("PERMISSIONS.INTAKE_EXPORT"), true);
assert.equal(handoffRoute.includes("X-Content-SHA256"), true);

const page = readFileSync(
  path.join(
    process.cwd(),
    "app/intake/[intakeId]/disposition/disposition-client.tsx",
  ),
  "utf8",
);
assert.equal(page.includes("Create Nexus Case"), true);
assert.equal(page.includes("Export to External Safety System"), true);
assert.equal(page.includes("Follow-up Existing Case"), true);
assert.equal(page.includes("Confirmed Duplicate"), true);
assert.equal(page.includes("Non-case"), true);
assert.equal(page.includes("Download governed JSON"), true);

console.log("Nexus Sprint 7 intake disposition verification passed.");
