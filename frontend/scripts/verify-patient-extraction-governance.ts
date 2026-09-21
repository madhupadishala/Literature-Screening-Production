import assert from "node:assert/strict";

import { governPatientExtraction } from "@/lib/literature/review/patient-extraction-governance";
import type { PatientExtractionResult } from "@/lib/literature/review/patient-extraction-types";

const title =
  "Ofloxacin and paracetamol induced Stevens-Johnson syndrome in an adult female patient: a case report.";
const abstractText =
  "A 29-year-old Indian female developed widespread dusky purpuric plaques six days after local consultation with ofloxacin and paracetamol. Diagnosis of Stevens-Johnson syndrome was made clinically. The patient was treated in Hyderabad, India.";

const raw: PatientExtractionResult = {
  classification: "SINGLE_PATIENT",
  confidence: 94,
  rationale: "One patient is described.",
  warnings: [],
  sourceGovernanceCorrections: [],
  patients: [
    {
      suggestionKey: "P1",
      patientLabel: "Patient 1",
      identifiablePatientStatus: "PRESENT",
      patientEvidence: {
        location: "ABSTRACT",
        quote: "A 29-year-old Indian female developed widespread dusky purpuric plaques",
      },
      age: "29-year-old",
      ageEvidence: {
        location: "ABSTRACT",
        quote: "A 29-year-old Indian female",
      },
      sex: "female",
      sexEvidence: {
        location: "ABSTRACT",
        quote: "A 29-year-old Indian female",
      },
      country: "India",
      countryEvidence: {
        location: "ABSTRACT",
        quote: "A 29-year-old Indian female",
      },
      products: [
        {
          name: "ofloxacin",
          evidence: {
            location: "ABSTRACT",
            quote: "local consultation with ofloxacin and paracetamol",
          },
        },
        {
          name: "cefixime",
          evidence: {
            location: "ABSTRACT",
            quote: "cefixime exposure not present in source",
          },
        },
      ],
      events: [
        {
          name: "Stevens-Johnson syndrome",
          evidence: {
            location: "ABSTRACT",
            quote: "Diagnosis of Stevens-Johnson syndrome was made clinically",
          },
        },
      ],
    },
  ],
};

const governed = governPatientExtraction({
  raw,
  title,
  abstractText,
});

assert.equal(governed.classification, "SINGLE_PATIENT");
assert.equal(governed.patients.length, 1);
assert.equal(governed.patients[0].age, "29-year-old");
assert.equal(governed.patients[0].sex, "female");
assert.equal(governed.patients[0].country, undefined);
assert.deepEqual(
  governed.patients[0].products.map((product) => product.name),
  ["ofloxacin"],
);
assert.deepEqual(
  governed.patients[0].events.map((event) => event.name),
  ["Stevens-Johnson syndrome"],
);
assert.ok(
  governed.sourceGovernanceCorrections.some((message) =>
    message.includes('country "India" removed'),
  ),
);
assert.ok(
  governed.sourceGovernanceCorrections.some((message) =>
    message.includes('product "cefixime" removed'),
  ),
);

const directCountry = governPatientExtraction({
  raw: {
    ...raw,
    patients: [
      {
        ...raw.patients[0],
        country: "India",
        countryEvidence: {
          location: "ABSTRACT",
          quote: "The patient was treated in Hyderabad, India",
        },
        products: raw.patients[0].products.slice(0, 1),
      },
    ],
  },
  title,
  abstractText,
});
assert.equal(directCountry.patients[0].country, "India");

const hallucinatedPatient = governPatientExtraction({
  raw: {
    classification: "SINGLE_PATIENT",
    confidence: 90,
    rationale: "One patient.",
    warnings: [],
    sourceGovernanceCorrections: [],
    patients: [
      {
        suggestionKey: "P1",
        patientLabel: "Patient 1",
        identifiablePatientStatus: "PRESENT",
        patientEvidence: {
          location: "ABSTRACT",
          quote: "This patient quote does not exist",
        },
        products: [],
        events: [],
      },
    ],
  },
  title,
  abstractText,
});
assert.equal(hallucinatedPatient.classification, "UNRESOLVED");
assert.equal(hallucinatedPatient.patients.length, 0);

console.log("Sprint 6B source-linked patient extraction governance verification passed.");
