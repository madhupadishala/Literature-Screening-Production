import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { assessCompanySuspect } from "../lib/pharmaceutical-intelligence/assessment-engine";
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

console.log("ClinixAI Pharmaceutical Product Intelligence verification passed.");
console.table(results);
