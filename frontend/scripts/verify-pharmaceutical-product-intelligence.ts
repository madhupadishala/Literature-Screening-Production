import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { assessCompanySuspect, assessCompanySuspects } from "../lib/pharmaceutical-intelligence/assessment-engine";
import {
  APPROVED_PHARMACEUTICAL_SCENARIOS,
  PHARMACEUTICAL_KNOWLEDGE_VERSION,
} from "../lib/pharmaceutical-intelligence/scenario-registry";
import type { SuspectProductEvidence } from "../lib/pharmaceutical-intelligence/types";

interface Fixture {
  id: string;
  evidence: SuspectProductEvidence;
  productMaster: Array<Record<string, unknown>>;
  expected: {
    conclusion: string;
    companySuspect: boolean | null;
    manualReviewRequired?: boolean;
    specialSituationReviewRequired?: boolean;
    preservedSalt?: string;
  };
}

const activeIndia = {
  clientProductId: "PM-PAR-IN-001",
  inn: "Paracetamol",
  country: "India",
  mah: "Demo MAH",
  active: true,
};

const fixtures: Fixture[] = [
  {
    id: "PPI-TST-001 equivalent name",
    evidence: { reportedProduct: "Acetaminophen", countryOfInterest: "India", presentationQualifierRole: "NOT_REPORTED" },
    productMaster: [activeIndia],
    expected: { conclusion: "CONFIRMED", companySuspect: true },
  },
  {
    id: "PPI-TST-002 common salt",
    evidence: { reportedProduct: "Diclofenac sodium", countryOfInterest: "India", presentationQualifierRole: "NOT_REPORTED" },
    productMaster: [{ clientProductId: "PM-DIC-IN-001", inn: "Diclofenac", country: "India", active: true }],
    expected: { conclusion: "CONFIRMED", companySuspect: true, preservedSalt: "sodium" },
  },
  {
    id: "PPI-TST-003 distinct Vitamin A composition",
    evidence: { reportedProduct: "Tretinoin", reportedComposition: "Tretinoin", countryOfInterest: "India", presentationQualifierRole: "NOT_REPORTED" },
    productMaster: [{ clientProductId: "PM-VITA-IN-001", composition: "Retinyl palmitate", country: "India", active: true }],
    expected: { conclusion: "NOT_COMPANY_PRODUCT", companySuspect: false },
  },
  {
    id: "PPI-TST-004 ambiguous Vitamin A family",
    evidence: { reportedProduct: "Vitamin A", countryOfInterest: "India", presentationQualifierRole: "UNCLEAR" },
    productMaster: [{ clientProductId: "PM-VITA-IN-001", composition: "Retinyl palmitate", country: "India", active: true }],
    expected: { conclusion: "UNRESOLVED", companySuspect: null, manualReviewRequired: true },
  },
  {
    id: "PPI-TST-005 IV formulation absent from master",
    evidence: { reportedProduct: "Paracetamol IV", reportedFormulation: "IV", countryOfInterest: "India", presentationQualifierRole: "PRODUCT_PRESENTATION" },
    productMaster: [activeIndia],
    expected: { conclusion: "NOT_COMPANY_PRESENTATION", companySuspect: false },
  },
  {
    id: "PPI-TST-006 tablet administered intravenously",
    evidence: { reportedProduct: "Paracetamol", reportedDosageForm: "tablet", reportedAdministrationRoute: "intravenous", countryOfInterest: "India", presentationQualifierRole: "ADMINISTRATION_CIRCUMSTANCE" },
    productMaster: [activeIndia],
    expected: { conclusion: "CONFIRMED", companySuspect: true, manualReviewRequired: true, specialSituationReviewRequired: true },
  },
  {
    id: "PPI-TST-007 no active licence in COI",
    evidence: { reportedProduct: "Paracetamol", countryOfInterest: "France", presentationQualifierRole: "NOT_REPORTED" },
    productMaster: [activeIndia],
    expected: { conclusion: "NO_ACTIVE_LICENCE_IN_COI", companySuspect: false },
  },
];

assert.equal(PHARMACEUTICAL_KNOWLEDGE_VERSION, "PPI-KB-1.0.0");
assert.equal(APPROVED_PHARMACEUTICAL_SCENARIOS.length, 6);
assert.equal(new Set(APPROVED_PHARMACEUTICAL_SCENARIOS.map((item) => item.id)).size, 6);
for (const scenario of APPROVED_PHARMACEUTICAL_SCENARIOS) {
  assert.equal(scenario.status, "APPROVED", `${scenario.id} is not approved.`);
  assert.ok(scenario.rule.trim(), `${scenario.id} has no governed rule.`);
  assert.ok(scenario.examples.length > 0, `${scenario.id} has no examples.`);
  assert.ok(scenario.prohibitedConclusions.length > 0, `${scenario.id} has no prohibited conclusions.`);
}

const governanceManifest = path.resolve(process.cwd(), "../knowledge/pharmaceutical-product-intelligence/v1.0/scenarios.json");
assert.ok(fs.existsSync(governanceManifest), "Pharmaceutical scenario governance manifest is missing.");

const results = fixtures.map((fixture) => {
  const assessment = assessCompanySuspect({ evidence: fixture.evidence, productMaster: fixture.productMaster });
  assert.equal(assessment.conclusion, fixture.expected.conclusion, fixture.id);
  assert.equal(assessment.companySuspect, fixture.expected.companySuspect, fixture.id);
  if (fixture.expected.manualReviewRequired !== undefined) {
    assert.equal(assessment.manualReviewRequired, fixture.expected.manualReviewRequired, fixture.id);
  }
  if (fixture.expected.specialSituationReviewRequired !== undefined) {
    assert.equal(assessment.specialSituationReviewRequired, fixture.expected.specialSituationReviewRequired, fixture.id);
  }
  if (fixture.expected.preservedSalt !== undefined) {
    assert.equal(assessment.preservedSalt?.toLowerCase(), fixture.expected.preservedSalt, fixture.id);
  }
  assert.ok(assessment.decisionTrail.length > 0, `${fixture.id} has no decision trail.`);
  assert.ok(assessment.appliedScenarioIds.length > 0, `${fixture.id} has no scenario provenance.`);
  return { fixture: fixture.id, conclusion: assessment.conclusion, assessmentId: assessment.assessmentId, status: "PASS" };
});

const point1Checks = [
  {
    id: "P1-SCN-004 spelling candidate",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Paracetmol", role: "SUSPECT" }, productMaster: [activeIndia] }),
    conclusion: "UNRESOLVED", manual: true,
  },
  {
    id: "P1-SCN-006 concomitant is not suspect",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Paracetamol", role: "CONCOMITANT" }, productMaster: [activeIndia] }),
    conclusion: "UNRESOLVED", manual: false,
  },
  {
    id: "P1-SCN-007 exact combination",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Amoxicillin clavulanic acid", role: "SUSPECT", components: ["Amoxicillin", "Clavulanic acid"], countryOfInterest: "India" }, productMaster: [{ clientProductId: "COMBO-1", genericName: "Amoxicillin clavulanic acid", composition: "Amoxicillin clavulanic acid", country: "India", active: true }] }),
    conclusion: "CONFIRMED", manual: false,
  },
  {
    id: "P1-SCN-008 mention is not suspect",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Paracetamol", role: "PRODUCT_MENTION" }, productMaster: [activeIndia] }),
    conclusion: "UNRESOLVED", manual: false,
  },
  {
    id: "P1-SCN-010 conflict",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Paracetamol", role: "SUSPECT", conflictingEvidence: ["Paracetamol IV", "Paracetamol tablet administered IV"] }, productMaster: [activeIndia] }),
    conclusion: "UNRESOLVED", manual: true,
  },
  {
    id: "P1-SCN-011 table evidence provenance",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "Paracetamol", role: "SUSPECT", evidenceLocation: "TABLE", countryOfInterest: "India" }, productMaster: [activeIndia] }),
    conclusion: "CONFIRMED", manual: false,
  },
  {
    id: "P1-SCN-012 no identifiable product",
    assessment: assessCompanySuspect({ evidence: { reportedProduct: "", role: "SUSPECT" }, productMaster: [activeIndia] }),
    conclusion: "UNRESOLVED", manual: false,
  },
];

for (const check of point1Checks) {
  assert.equal(check.assessment.conclusion, check.conclusion, check.id);
  assert.equal(check.assessment.manualReviewRequired, check.manual, check.id);
}
const multiple = assessCompanySuspects({
  evidence: [
    { reportedProduct: "Paracetamol", role: "SUSPECT", countryOfInterest: "India" },
    { reportedProduct: "Amoxicillin", role: "SUSPECT", countryOfInterest: "India" },
  ],
  productMaster: [activeIndia, { clientProductId: "AMX-1", inn: "Amoxicillin", country: "India", active: true }],
});
assert.equal(multiple.length, 2, "P1-SCN-005 must assess every suspect independently.");
assert.ok(multiple.every((item) => item.companySuspect === true), "P1-SCN-005 multiple suspects did not resolve independently.");

console.log("ClinixAI Pharmaceutical Product Intelligence verification passed.");
console.table(results);
console.table(point1Checks.map((check) => ({ scenario: check.id, conclusion: check.assessment.conclusion, status: "PASS" })));
console.log("Point 1 company-suspect scenarios: 12/12 governed; extended executable checks passed.");
