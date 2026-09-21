import assert from "node:assert/strict";

import { canonicalSha256 } from "../lib/safety/common/canonical-json";
import { buildE2BR3CasePayload } from "../lib/safety/common/case-payload-builder";
import { literatureIntakeToSafetyDraft } from "../lib/safety/common/literature-intake-adapter";
import {
  E2B_PROFILE,
  E2B_R3_SECTIONS,
  SAFETY_BACKBONE_SCHEMA_VERSION,
} from "../lib/safety/common/safety-types";
import {
  validateE2BR3CasePayload,
  validateIntakeDraft,
} from "../lib/safety/common/safety-validation";

assert.equal(E2B_PROFILE, "ICH_E2B_R3");
assert.equal(E2B_R3_SECTIONS.CASE_IDENTIFICATION_AND_SOURCE, "C");
assert.equal(E2B_R3_SECTIONS.PATIENT, "D");
assert.equal(E2B_R3_SECTIONS.REACTIONS_EVENTS, "E");
assert.equal(E2B_R3_SECTIONS.TESTS_PROCEDURES, "F");
assert.equal(E2B_R3_SECTIONS.DRUGS, "G");
assert.equal(E2B_R3_SECTIONS.NARRATIVE_AND_FURTHER_INFORMATION, "H");

assert.equal(
  canonicalSha256({ b: 2, a: 1 }),
  canonicalSha256({ a: 1, b: 2 }),
);

const literatureDraft = literatureIntakeToSafetyDraft({
  exportId: "11111111-1111-4111-8111-111111111111",
  exportVersion: 2,
  exportSha256: "a".repeat(64),
  generatedAt: "2026-09-22T00:00:00.000Z",
  payload: {
    package: {
      package_id: "22222222-2222-4222-8222-222222222222",
      package_key: "LIT-PKG-42",
      source_type: "PUBMED",
      external_reference: "12345678",
    },
    article: {
      pmid: "12345678",
      title: "Synthetic governed literature case",
    },
    product_context: {
      products: ["Example Drug"],
    },
    screening_assessment: {
      result: {
        result: {
          companySuspectAssessments: [
            {
              reportedProduct: "Example Drug",
              role: "SUSPECT",
            },
          ],
          regulatoryEvidence: {
            clinicalEvents: [{ event: "Headache" }],
          },
        },
      },
      final_decision: "INCLUDE",
    },
    review_assessment: {
      patient_segments: [
        {
          patientSegmentKey: "PATIENT-1",
          sex: "female",
          age: 34,
          ageUnit: "year",
        },
      ],
      medical_review_status: "APPROVED",
    },
    duplicate_intelligence: [],
    governance: {
      source_lineage: {
        screening_result_id: "33333333-3333-4333-8333-333333333333",
        screening_result_version: 3,
        review_workspace_id: "44444444-4444-4444-8444-444444444444",
      },
    },
  },
});

validateIntakeDraft(literatureDraft);
assert.equal(
  literatureDraft.source.sourceKey,
  "literature:22222222-2222-4222-8222-222222222222:export:11111111-1111-4111-8111-111111111111",
);
assert.equal(literatureDraft.intake.intakeKey, "LIT-LIT-PKG-42-E2");
assert.equal(literatureDraft.patients.length, 1);
assert.equal(literatureDraft.patients[0].sex, "FEMALE");
assert.equal(literatureDraft.products.length, 1);
assert.equal(literatureDraft.products[0].roleCharacterization, "SUSPECT");
assert.equal(literatureDraft.events.length, 1);
assert.equal(literatureDraft.events[0].reportedTerm, "Headache");

assert.throws(
  () =>
    validateIntakeDraft({
      ...literatureDraft,
      products: [
        literatureDraft.products[0],
        { ...literatureDraft.products[0] },
      ],
    }),
  /Duplicate product key/,
);

const casePayload = buildE2BR3CasePayload({
  tenantId: "tenant-1",
  caseId: "case-1",
  caseKey: "CASE-2026-0001",
  intakeRecordId: "intake-1",
  version: 1,
  lineage: literatureDraft.intake.lineage,
  identification: {
    reportType: "spontaneous",
    source: "literature",
  },
  reporters: [
    {
      reporterKey: "reporter-1",
      primarySource: true,
      qualification: "Physician",
      countryCode: "IN",
    },
  ],
  patient: literatureDraft.patients[0],
  events: literatureDraft.events,
  tests: [],
  products: literatureDraft.products,
  narrative: {
    caseNarrative: "Synthetic verification narrative.",
  },
});

validateE2BR3CasePayload(casePayload);
assert.equal(casePayload.profile, E2B_PROFILE);
assert.equal(casePayload.schemaVersion, SAFETY_BACKBONE_SCHEMA_VERSION);
assert.equal(casePayload.C.primarySources instanceof Array, true);
assert.equal(casePayload.D.patientKey, "PATIENT-1");
assert.equal(casePayload.E[0].reportedTerm, "Headache");
assert.equal(casePayload.G[0].reportedName, "Example Drug");
assert.equal(casePayload.H.caseNarrative, "Synthetic verification narrative.");

assert.throws(
  () =>
    validateE2BR3CasePayload({
      ...casePayload,
      nexus: {
        ...casePayload.nexus,
        caseId: "",
      },
    }),
  /lineage is incomplete/,
);

console.log("Nexus Sprint 2 common safety backbone verification passed.");
