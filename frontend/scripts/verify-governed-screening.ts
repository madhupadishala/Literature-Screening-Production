import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parseScreeningAIResult } from "../lib/ai/screening-result-parser";
import { validateAuditReason } from "../lib/audit/reason";
import { validateConfigurationPayload } from "../lib/configuration/validation";
import { assessCompanySuspect } from "../lib/pharmaceutical-intelligence/assessment-engine";
import { assessPVDecisionArchitecture } from "../lib/pv-decision-intelligence/assessment-engine";
import {
  deriveGovernedScreeningDecision,
  finalIncludeEligibility,
} from "../lib/literature/screening/governed-decision";

const raw = JSON.stringify({
  decision: "INCLUDE",
  confidence: 91,
  reason: "CASE_REPORT",
  findings: [
    {
      rule: "SDI-008",
      passed: true,
      score: 95,
      comment: "Case report contains patient-safety evidence.",
    },
  ],
  safetyEvidence: {
    populationType: "HUMAN",
    patientIdentifiable: "PRESENT",
    reporterIdentifiable: "UNRESOLVED",
    medicinalProductExposure: "PRESENT",
    adverseEventOrReaction: "PRESENT",
    specialSituation: "ABSENT",
    patientEvidence: "5 year, 3 month-old female",
    productEvidence: "amoxicillin",
    eventEvidence: "severe allergic reaction to amoxicillin",
  },
  regulatoryEvidence: {
    publicationClassification: "CASE_REPORT",
    publicationClassificationEvidence: "a case report",
    clinicalEvents: [
      {
        event: "severe allergic reaction",
        evidence: "severe allergic reaction to amoxicillin",
        severity: "SEVERE",
        seriousness: "UNRESOLVED",
        seriousnessCriteria: [],
      },
    ],
    patientPiiStatus: "ABSENT",
    countryOfIncidenceStatus: "PRESENT",
    countryOfIncidence: "India",
    countryOfIncidenceEvidence: "patient was treated in India",
  },
  extractedSuspectEvidence: [
    {
      reportedProduct: "amoxicillin",
      role: "SUSPECT",
      roleEvidence: "reaction to amoxicillin",
      sourceEvidence: "severe allergic reaction to amoxicillin",
      evidenceLocation: "ABSTRACT",
      countryOfInterest: "India",
      relevantDate: "2026-02-15",
      presentationQualifierRole: "NOT_REPORTED",
    },
  ],
});

const missingCountryParsed = parseScreeningAIResult(
  JSON.stringify({
    decision: "REVIEW",
    confidence: 80,
    reason: "INSUFFICIENT_INFORMATION",
    findings: [],
    safetyEvidence: {
      populationType: "HUMAN",
      patientIdentifiable: "PRESENT",
      reporterIdentifiable: "ABSENT",
      medicinalProductExposure: "PRESENT",
      adverseEventOrReaction: "PRESENT",
      specialSituation: "ABSENT"
    },
    regulatoryEvidence: {
      publicationClassification: "CASE_REPORT",
      clinicalEvents: [],
      patientPiiStatus: "ABSENT",
      countryOfIncidenceStatus: "ABSENT",
      countryOfIncidenceEvidence: "no country provided"
    },
    extractedSuspectEvidence: []
  }),
);
assert.equal(
  missingCountryParsed.regulatoryEvidence.countryOfIncidenceStatus,
  "UNRESOLVED",
  "Missing COI evidence must not be treated as a proven negative.",
);
assert.equal(validateAuditReason("Not applicable").valid, false);
assert.equal(
  validateAuditReason("Sprint 3 governed Screening validation rerun").valid,
  true,
);

const parsed = parseScreeningAIResult(raw);
assert.equal(parsed.regulatoryEvidence.publicationClassification, "CASE_REPORT");
assert.equal(parsed.regulatoryEvidence.clinicalEvents.length, 1);
assert.equal(parsed.regulatoryEvidence.clinicalEvents[0].severity, "SEVERE");
assert.equal(
  parsed.regulatoryEvidence.clinicalEvents[0].seriousness,
  "UNRESOLVED",
  "Severity must not be promoted to regulatory seriousness.",
);
assert.equal(parsed.regulatoryEvidence.patientPiiStatus, "ABSENT");

const pv = assessPVDecisionArchitecture({
  safetyEvidence: parsed.safetyEvidence,
  detectedEvents: parsed.regulatoryEvidence.clinicalEvents.map((event) => event.event),
  detectedSpecialSituations: [],
  suspectEvidence: parsed.extractedSuspectEvidence,
  reporterIdentifiers: ["da Fonseca MA."],
});
assert.equal(pv.patientSafety.relevance, "RELEVANT");
assert.equal(pv.icsr.conclusion, "POTENTIAL_ICSR");
assert.equal(pv.icsr.identifiableReporter, "PRESENT");

const noProductMaster = parsed.extractedSuspectEvidence.map((evidence) =>
  assessCompanySuspect({ evidence, productMaster: [] }),
);
assert.equal(noProductMaster[0].conclusion, "UNRESOLVED");
assert.equal(noProductMaster[0].licenceStatus, "NOT_CONFIGURED");
assert.equal(
  deriveGovernedScreeningDecision({
    aiDecision: parsed.decision,
    patientSafety: pv.patientSafety,
    icsr: pv.icsr,
    companyAssessments: noProductMaster,
  }),
  "REVIEW",
);
assert.equal(finalIncludeEligibility(noProductMaster).eligible, false);

const activeProductMaster = [
  {
    clientProductId: "AMX-IN-001",
    brandName: "Example Amoxicillin",
    genericName: "Amoxicillin",
    inn: "Amoxicillin",
    api: "Amoxicillin",
    composition: "Amoxicillin",
    synonyms: ["amoxicillin"],
    dosageForm: "Capsule",
    formulation: "Immediate release capsule",
    route: "Oral",
    country: "India",
    lifecycleStatus: "MARKETED",
    investigationalOrMarketed: "Marketed",
    mah: "Example MAH India",
    mahEffectiveFrom: "2026-01-01",
    mahEffectiveTo: null,
    active: true,
  },
];

const activeAssessments = parsed.extractedSuspectEvidence.map((evidence) =>
  assessCompanySuspect({ evidence, productMaster: activeProductMaster }),
);
assert.equal(activeAssessments[0].conclusion, "CONFIRMED");
assert.equal(activeAssessments[0].licenceStatus, "ACTIVE");
assert.equal(
  deriveGovernedScreeningDecision({
    aiDecision: parsed.decision,
    patientSafety: pv.patientSafety,
    icsr: pv.icsr,
    companyAssessments: activeAssessments,
  }),
  "INCLUDE",
);
assert.equal(finalIncludeEligibility(activeAssessments).eligible, true);

const wrongCountry = parsed.extractedSuspectEvidence.map((evidence) =>
  assessCompanySuspect({
    evidence,
    productMaster: [{ ...activeProductMaster[0], country: "France" }],
  }),
);
assert.equal(wrongCountry[0].conclusion, "NO_ACTIVE_LICENCE_IN_COI");
assert.equal(
  deriveGovernedScreeningDecision({
    aiDecision: parsed.decision,
    patientSafety: pv.patientSafety,
    icsr: pv.icsr,
    companyAssessments: wrongCountry,
  }),
  "EXCLUDE",
);

const expiredProduct = parsed.extractedSuspectEvidence.map((evidence) =>
  assessCompanySuspect({
    evidence,
    productMaster: [
      {
        ...activeProductMaster[0],
        mahEffectiveFrom: "2025-01-01",
        mahEffectiveTo: "2025-12-31",
      },
    ],
  }),
);
assert.equal(expiredProduct[0].conclusion, "NO_ACTIVE_LICENCE_IN_COI");
assert.equal(expiredProduct[0].licenceStatus, "INACTIVE");

const validProductMaster = validateConfigurationPayload("PRODUCT_MASTER", {
  records: activeProductMaster,
});
assert.equal(validProductMaster.valid, true);

const invalidProductMaster = validateConfigurationPayload("PRODUCT_MASTER", {
  records: [
    {
      clientProductId: "BAD-001",
      inn: "Amoxicillin",
      country: "India",
      active: true,
    },
  ],
});
assert.equal(invalidProductMaster.valid, false);
assert.ok(
  invalidProductMaster.errors.some((error) => error.path.endsWith(".mah")),
  "Product Master validation must require MAH.",
);
assert.ok(
  invalidProductMaster.errors.some((error) => error.path.endsWith(".lifecycleStatus")),
  "Product Master validation must require lifecycle classification.",
);

const templatePath = path.resolve(
  process.cwd(),
  "templates/configuration/product-master-template.csv",
);
const templateLines = fs
  .readFileSync(templatePath, "utf8")
  .trim()
  .split(/\r?\n/);
assert.ok(templateLines.length >= 2, "Product Master template requires a sample row.");
assert.equal(
  templateLines[0].split(",").length,
  templateLines[1].split(",").length,
  "Product Master template sample row must align with headers.",
);

console.log("ClinixAI governed Screening and Product/MAH verification passed.");
console.table([
  {
    scenario: "No Product Master",
    patientSafety: pv.patientSafety.relevance,
    genericIcsr: pv.icsr.conclusion,
    company: noProductMaster[0].conclusion,
    screening: "REVIEW",
  },
  {
    scenario: "Active company product / MAH",
    patientSafety: pv.patientSafety.relevance,
    genericIcsr: pv.icsr.conclusion,
    company: activeAssessments[0].conclusion,
    screening: "INCLUDE",
  },
  {
    scenario: "No active licence in COI",
    patientSafety: pv.patientSafety.relevance,
    genericIcsr: pv.icsr.conclusion,
    company: wrongCountry[0].conclusion,
    screening: "EXCLUDE",
  },
]);
