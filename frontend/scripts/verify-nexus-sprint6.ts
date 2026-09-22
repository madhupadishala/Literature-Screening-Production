import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  compareDuplicateFingerprints,
  rankDuplicateCandidates,
} from "../lib/safety/duplicate/duplicate-matcher";
import type { DuplicateFingerprint } from "../lib/safety/duplicate/duplicate-types";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "database/migrations/027_nexus_duplicate_followup_review.sql",
  ),
  "utf8",
);

for (const table of [
  "safety_duplicate_review_runs",
  "safety_duplicate_candidates",
  "safety_duplicate_assessments",
]) {
  assert.equal(
    migration.split(`CREATE TABLE IF NOT EXISTS ${table}`).length - 1,
    1,
    `Migration 027 must define ${table} exactly once.`,
  );
}

assert.equal(migration.includes("case_relationship"), true);
assert.equal(migration.includes("'NEW_CASE', 'FOLLOW_UP', 'DUPLICATE', 'NOT_MATCH'"), true);
assert.equal(migration.includes("source_snapshot_sha256"), true);
assert.equal(migration.includes("human_decision"), true);

const source: DuplicateFingerprint = {
  intakeRecordId: "intake-current",
  intakeKey: "INT-001",
  externalReference: "SRC-001",
  sourceRecordKey: "REQ-001",
  sourceType: "SPONTANEOUS",
  countryCode: "IN",
  initialReceiptDate: "2026-09-20",
  latestReceiptDate: "2026-09-20",
  sourceIdentifiers: ["PMID:1234", "10.1000/example"],
  patients: [
    {
      patientReference: "PATIENT-A",
      sex: "FEMALE",
      dateOfBirth: "1988-02-10",
      ageValue: 38,
      ageUnit: "year",
    },
  ],
  reporters: [
    {
      qualification: "Physician",
      organization: "Hospital A",
      countryCode: "IN",
    },
  ],
  products: [
    {
      reportedName: "Example Drug",
      roleCharacterization: "SUSPECT",
    },
  ],
  events: [
    {
      reportedTerm: "Anaphylaxis",
      onsetDate: "2026-09-19T00:00:00.000Z",
    },
  ],
};

const likelyMatch: DuplicateFingerprint = {
  ...source,
  intakeRecordId: "intake-old",
  intakeKey: "INT-OLD",
  caseId: "case-old",
  caseKey: "CASE-2026-001",
  externalReference: "DIFFERENT-REF",
  sourceRecordKey: "REQ-OLD",
};

const match = compareDuplicateFingerprints(source, likelyMatch);
assert.equal(match.score >= 75, true);
assert.equal(match.confidenceBand, "HIGH");
assert.equal(
  match.matchedFactors.some((factor) => factor.key === "PRODUCT_OVERLAP"),
  true,
);
assert.equal(
  match.matchedFactors.some((factor) => factor.key === "EVENT_OVERLAP"),
  true,
);
assert.equal(
  match.matchedFactors.some((factor) => factor.key === "DATE_OF_BIRTH_EXACT"),
  true,
);

const unrelated: DuplicateFingerprint = {
  intakeRecordId: "intake-unrelated",
  intakeKey: "INT-X",
  externalReference: "OTHER",
  sourceRecordKey: "OTHER-REQ",
  sourceType: "SPONTANEOUS",
  countryCode: "US",
  initialReceiptDate: "2025-01-01",
  latestReceiptDate: "2025-01-01",
  sourceIdentifiers: [],
  patients: [
    {
      patientReference: "OTHER-PATIENT",
      sex: "MALE",
      ageValue: 70,
      ageUnit: "year",
    },
  ],
  reporters: [{ qualification: "Consumer", organization: "Other" }],
  products: [{ reportedName: "Other Drug", roleCharacterization: "SUSPECT" }],
  events: [{ reportedTerm: "Nausea", onsetDate: "2025-01-01" }],
};

assert.equal(compareDuplicateFingerprints(source, unrelated).score < 25, true);
assert.equal(
  rankDuplicateCandidates(source, [likelyMatch, unrelated]).length,
  1,
);

const service = readFileSync(
  path.join(process.cwd(), "lib/safety/duplicate/duplicate-service.ts"),
  "utf8",
);
assert.equal(service.includes("POTENTIAL_MATCH"), true);
assert.equal(service.includes("humanDecision"), true);
assert.equal(service.includes("READY_FOR_DISPOSITION"), true);
assert.equal(service.includes("CONFIRMED_DUPLICATE"), true);
assert.equal(
  service.includes("Only a VALID ICSR can enter duplicate/follow-up review."),
  true,
);
assert.equal(
  service.includes("A selected candidate is required for FOLLOW_UP or DUPLICATE."),
  true,
);

const triageService = readFileSync(
  path.join(process.cwd(), "lib/safety/triage/triage-service.ts"),
  "utf8",
);
assert.equal(triageService.includes("'DUPLICATE_REVIEW','OPEN'"), true);

for (const route of [
  "app/api/safety/intake/[intakeId]/duplicate-review/route.ts",
  "app/api/safety/intake/[intakeId]/duplicate-review/finalize/route.ts",
]) {
  const routeSource = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(routeSource.includes("NEXUS_MODULES.INTAKE"), true);
  assert.equal(routeSource.includes("requireModulePermission"), true);
}

const page = readFileSync(
  path.join(
    process.cwd(),
    "app/intake/[intakeId]/duplicate-review/duplicate-review-client.tsx",
  ),
  "utf8",
);
assert.equal(page.includes("Potential Matches"), true);
assert.equal(page.includes("Final Relationship Decision"), true);
assert.equal(page.includes("Follow-up"), true);
assert.equal(page.includes("Duplicate"), true);
assert.equal(page.includes("Not Match"), true);

console.log("Nexus Sprint 6 duplicate and follow-up verification passed.");
