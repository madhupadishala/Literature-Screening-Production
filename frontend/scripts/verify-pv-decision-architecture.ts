import assert from "node:assert/strict";

import { assessPVDecisionArchitecture } from "../lib/pv-decision-intelligence/assessment-engine";
import type {
  PVDecisionAssessmentInput,
  SafetyEvidenceExtraction,
} from "../lib/pv-decision-intelligence/types";

function safety(
  overrides: Partial<SafetyEvidenceExtraction>,
): SafetyEvidenceExtraction {
  return {
    populationType: "UNRESOLVED",
    patientIdentifiable: "UNRESOLVED",
    reporterIdentifiable: "UNRESOLVED",
    medicinalProductExposure: "UNRESOLVED",
    adverseEventOrReaction: "UNRESOLVED",
    specialSituation: "UNRESOLVED",
    ...overrides,
  };
}

const fixtures: Array<{
  id: string;
  input: PVDecisionAssessmentInput;
  expectedSafety: string;
  expectedIcsr: string;
  expectedMinimumCriteria: boolean | null;
}> = [
  {
    id: "PV-ARCH-001 human case report with generic ICSR elements",
    input: {
      safetyEvidence: safety({
        populationType: "HUMAN",
        patientIdentifiable: "PRESENT",
        reporterIdentifiable: "PRESENT",
        medicinalProductExposure: "PRESENT",
        adverseEventOrReaction: "PRESENT",
        specialSituation: "ABSENT",
        patientEvidence: "5 year, 3 month-old female",
        reporterEvidence: "da Fonseca MA",
        productEvidence: "amoxicillin",
        eventEvidence: "severe allergic reaction to amoxicillin",
      }),
      detectedEvents: ["severe allergic reaction"],
      detectedSpecialSituations: [],
      suspectEvidence: [
        {
          reportedProduct: "amoxicillin",
          role: "SUSPECT",
          sourceEvidence: "severe allergic reaction to amoxicillin",
          evidenceLocation: "ABSTRACT",
        },
      ],
    },
    expectedSafety: "RELEVANT",
    expectedIcsr: "POTENTIAL_ICSR",
    expectedMinimumCriteria: true,
  },
  {
    id: "PV-ARCH-002 aggregate human safety article without identifiable patient",
    input: {
      safetyEvidence: safety({
        populationType: "HUMAN",
        patientIdentifiable: "ABSENT",
        reporterIdentifiable: "PRESENT",
        medicinalProductExposure: "PRESENT",
        adverseEventOrReaction: "PRESENT",
        specialSituation: "ABSENT",
      }),
      detectedEvents: ["rash"],
      detectedSpecialSituations: [],
      suspectEvidence: [
        { reportedProduct: "amoxicillin", role: "SUSPECT" },
      ],
    },
    expectedSafety: "RELEVANT",
    expectedIcsr: "NOT_ICSR",
    expectedMinimumCriteria: false,
  },
  {
    id: "PV-ARCH-003 animal-only safety finding",
    input: {
      safetyEvidence: safety({
        populationType: "ANIMAL",
        patientIdentifiable: "ABSENT",
        reporterIdentifiable: "PRESENT",
        medicinalProductExposure: "PRESENT",
        adverseEventOrReaction: "PRESENT",
        specialSituation: "ABSENT",
      }),
      detectedEvents: ["hepatotoxicity"],
      detectedSpecialSituations: [],
      suspectEvidence: [
        { reportedProduct: "test drug", role: "SUSPECT" },
      ],
    },
    expectedSafety: "NOT_RELEVANT",
    expectedIcsr: "NOT_ICSR",
    expectedMinimumCriteria: false,
  },
  {
    id: "PV-ARCH-004 insufficient evidence remains unresolved",
    input: {
      safetyEvidence: safety({}),
      detectedEvents: [],
      detectedSpecialSituations: [],
      suspectEvidence: [],
    },
    expectedSafety: "UNRESOLVED",
    expectedIcsr: "UNRESOLVED",
    expectedMinimumCriteria: null,
  },
  {
    id: "PV-ARCH-005 special situation supports patient safety",
    input: {
      safetyEvidence: safety({
        populationType: "HUMAN",
        patientIdentifiable: "PRESENT",
        reporterIdentifiable: "PRESENT",
        medicinalProductExposure: "PRESENT",
        adverseEventOrReaction: "ABSENT",
        specialSituation: "PRESENT",
        specialSituationEvidence: "exposure during pregnancy",
      }),
      detectedEvents: [],
      detectedSpecialSituations: ["pregnancy exposure"],
      suspectEvidence: [
        { reportedProduct: "medicine A", role: "SUSPECT" },
      ],
    },
    expectedSafety: "RELEVANT",
    expectedIcsr: "POTENTIAL_ICSR",
    expectedMinimumCriteria: true,
  },
];

for (const fixture of fixtures) {
  const assessment = assessPVDecisionArchitecture(fixture.input);
  assert.equal(
    assessment.patientSafety.relevance,
    fixture.expectedSafety,
    `${fixture.id}: patient-safety relevance`,
  );
  assert.equal(
    assessment.icsr.conclusion,
    fixture.expectedIcsr,
    `${fixture.id}: generic ICSR conclusion`,
  );
  assert.equal(
    assessment.icsr.minimumCriteriaSatisfied,
    fixture.expectedMinimumCriteria,
    `${fixture.id}: minimum criteria`,
  );
  assert.ok(
    assessment.patientSafety.appliedKnowledgeObjectIds.includes("VAL-005"),
    `${fixture.id}: missing patient-safety knowledge provenance`,
  );
  assert.ok(
    assessment.icsr.appliedKnowledgeObjectIds.includes("VAL-002") &&
      assessment.icsr.appliedKnowledgeObjectIds.includes("VAL-003"),
    `${fixture.id}: missing ICSR knowledge provenance`,
  );
}

console.log("ClinixAI PV decision architecture verification passed.");
console.table(
  fixtures.map((fixture) => {
    const result = assessPVDecisionArchitecture(fixture.input);
    return {
      scenario: fixture.id,
      patientSafety: result.patientSafety.relevance,
      genericIcsr: result.icsr.conclusion,
      status: "PASS",
    };
  }),
);
