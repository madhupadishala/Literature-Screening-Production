import assert from "node:assert/strict";

import { buildGovernedPatientCaseCandidates } from "../lib/literature/intake-input/intake-case-governance";

const candidates = buildGovernedPatientCaseCandidates({
  patientSegments: [
    {
      patientSegmentKey: "P1",
      identifiablePatientStatus: "PRESENT",
      products: ["Product A", "Product B"],
      events: ["Event X", "Event Y"],
    },
    {
      patientSegmentKey: "P2",
      identifiablePatientStatus: "PRESENT",
      products: ["Product A"],
      events: ["Event Z"],
    },
  ],
  labelAssessments: [
    { patient_segment_key: "P1", reported_product: "Product A", clinical_event: "Event X", conclusion: "EXPECTED" },
    { patient_segment_key: "P1", reported_product: "Product B", clinical_event: "Event Y", conclusion: "UNEXPECTED" },
    { patient_segment_key: "P2", reported_product: "Product A", clinical_event: "Event Z", conclusion: "UNRESOLVED" },
  ],
  causalityAssessments: [
    { patient_segment_key: "P1", reported_product: "Product A", clinical_event: "Event X", conclusion: "RELATED" },
    { patient_segment_key: "P1", reported_product: "Product B", clinical_event: "Event Y", conclusion: "POSSIBLY_RELATED" },
    { patient_segment_key: "P2", reported_product: "Product A", clinical_event: "Event Z", conclusion: "UNRESOLVED" },
  ],
});

assert.equal(candidates.length, 2);
assert.equal(candidates[0].relations.length, 2);
assert.deepEqual(
  candidates[0].relations.map((relation) => [relation.reportedProduct, relation.clinicalEvent]),
  [["Product A", "Event X"], ["Product B", "Event Y"]],
);
assert.equal(candidates[1].relations.length, 1);

assert.throws(
  () =>
    buildGovernedPatientCaseCandidates({
      patientSegments: [
        {
          patientSegmentKey: "P1",
          products: ["Product A"],
          events: ["Event X"],
        },
      ],
      labelAssessments: [
        { patient_segment_key: "P1", reported_product: "Product A", clinical_event: "Event X" },
      ],
      causalityAssessments: [],
    }),
  /same explicit patient-product-event relations/i,
);

console.log("Sprint 8 multi-patient Intake relation governance verification passed.");
