import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateTriageSnapshot } from "../lib/safety/triage/triage-evaluator";

const migration = readFileSync(
  path.join(process.cwd(), "database/migrations/026_nexus_icsr_validity_triage.sql"),
  "utf8",
);

assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_triage_assessments").length - 1,
  1,
);
assert.equal(migration.includes("human_minimum_criteria jsonb NOT NULL"), true);
assert.equal(
  migration.includes("jsonb_typeof(human_minimum_criteria) = 'array'"),
  true,
);
assert.equal(migration.includes("triage_status"), true);
assert.equal(migration.includes("follow_up_required"), true);

const valid = evaluateTriageSnapshot({
  patients: [
    {
      patient_key: "patient-1",
      age_value: "42",
      age_unit: "year",
      sex: "FEMALE",
    },
  ],
  reporters: [
    {
      reporter_key: "reporter-1",
      qualification: "Physician",
      country_code: "IN",
    },
  ],
  products: [
    {
      product_key: "product-1",
      reported_name: "Example Drug",
      role_characterization: "SUSPECT",
    },
  ],
  events: [
    {
      event_key: "event-1",
      reported_term: "Anaphylaxis",
      seriousness: true,
      seriousness_criteria: {
        LIFE_THREATENING: true,
      },
    },
  ],
  sourcePayload: {},
  intakePayload: {},
});

assert.equal(valid.validityRecommendation, "VALID");
assert.equal(valid.criteria.every((item) => item.status === "MET"), true);
assert.equal(valid.seriousnessRecommendation, "SERIOUS");
assert.equal(
  valid.seriousnessEvidence.LIFE_THREATENING?.includes("Anaphylaxis"),
  true,
);
assert.equal(valid.priorityRecommendation, "URGENT");

const interacting = evaluateTriageSnapshot({
  patients: [{ patient_reference: "Patient A" }],
  reporters: [{ qualification: "Consumer" }],
  products: [
    {
      reported_name: "Interacting Drug",
      role_characterization: "INTERACTING",
    },
  ],
  events: [{ reported_term: "Dizziness", seriousness: false }],
  sourcePayload: {},
  intakePayload: {},
});
assert.equal(
  interacting.criteria.find((item) => item.key === "SUSPECT_PRODUCT")?.status,
  "MET",
);
assert.equal(
  interacting.criteria.find((item) => item.key === "IDENTIFIABLE_REPORTER")?.status,
  "MET",
);
assert.equal(interacting.followUpRecommended, true);
assert.equal(
  interacting.followUpReasons.some((item) => item.includes("Reporter country")),
  true,
);

const incomplete = evaluateTriageSnapshot({
  patients: [{ patient_key: "internal-only" }],
  reporters: [],
  products: [],
  events: [],
  sourcePayload: {},
  intakePayload: {},
});
assert.equal(incomplete.validityRecommendation, "UNRESOLVED");
assert.equal(
  incomplete.criteria.find((item) => item.key === "IDENTIFIABLE_PATIENT")?.status,
  "MISSING",
);
assert.equal(incomplete.followUpRecommended, true);

const notPregnant = evaluateTriageSnapshot({
  patients: [
    {
      patient_reference: "Patient B",
      pregnancy_status: "NOT_PREGNANT",
      age_value: "31",
      age_unit: "year",
    },
  ],
  reporters: [{ qualification: "Physician", country_code: "IN" }],
  products: [{ reported_name: "Drug B", role_characterization: "SUSPECT" }],
  events: [{ reported_term: "Nausea", seriousness: false }],
  sourcePayload: { narrative: "Patient was not pregnant." },
  intakePayload: {},
});
assert.equal(notPregnant.detectedSpecialSituations.includes("PREGNANCY"), false);

const special = evaluateTriageSnapshot({
  patients: [{ patient_reference: "Patient C", age_value: "14", age_unit: "year" }],
  reporters: [{ qualification: "Pharmacist", country_code: "IN" }],
  products: [{ reported_name: "Drug C", role_characterization: "SUSPECT" }],
  events: [{ reported_term: "Somnolence", seriousness: false }],
  sourcePayload: {
    narrative:
      "The patient experienced an overdose following a medication error.",
  },
  intakePayload: {},
});
assert.equal(special.detectedSpecialSituations.includes("PEDIATRIC"), true);
assert.equal(special.detectedSpecialSituations.includes("OVERDOSE"), true);
assert.equal(special.detectedSpecialSituations.includes("MEDICATION_ERROR"), true);

const route = readFileSync(
  path.join(process.cwd(), "app/api/safety/intake/[intakeId]/triage/route.ts"),
  "utf8",
);
assert.equal(route.includes("NEXUS_MODULES.INTAKE"), true);
assert.equal(route.includes("PERMISSIONS.INTAKE_VIEW"), true);
assert.equal(route.includes("PERMISSIONS.INTAKE_PROCESS"), true);

const service = readFileSync(
  path.join(process.cwd(), "lib/safety/triage/triage-service.ts"),
  "utf8",
);
assert.equal(service.includes('source_review_status) !== "VERIFIED"'), true);
assert.equal(service.includes("Exactly four minimum ICSR criteria are required."), true);
assert.equal(service.includes("A VALID ICSR requires all four"), true);
assert.equal(service.includes("UPDATE safety_review_tasks"), true);
assert.equal(service.includes("READY_FOR_DUPLICATE_REVIEW"), true);
assert.equal(service.includes("CREATE Nexus Case"), false);

const client = readFileSync(
  path.join(
    process.cwd(),
    "app/intake/[intakeId]/triage/triage-client.tsx",
  ),
  "utf8",
);
assert.equal(client.includes("Four ICSR Criteria"), true);
assert.equal(client.includes("Seriousness"), true);
assert.equal(client.includes("Special Situations"), true);
assert.equal(client.includes("Follow-up required"), true);
assert.equal(client.includes("Finalize triage assessment"), true);

console.log("Nexus Sprint 5 ICSR validity and triage verification passed.");
