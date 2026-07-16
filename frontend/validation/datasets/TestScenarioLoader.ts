import type { ValidationScenario } from "../types/ValidationTypes";

export class TestScenarioLoader {
  static loadDefaultScenarios(): ValidationScenario[] {
    return [
      {
        id: "VAL-001",
        title: "Valid literature case with product, AE, patient, and reporter",
        category: "VALIDITY_ASSESSMENT",
        pmid: "TEST-PMID-001",
        inputText:
          "A 65-year-old male experienced liver injury after receiving paracetamol. The case was reported by Smith et al. from India.",
        expected: {
          productNames: ["paracetamol"],
          adverseEvents: ["liver injury"],
          patientPresent: true,
          reporterPresent: true,
          country: "India",
          validCaseExpected: true,
          seriousExpected: true,
        },
        tags: ["validity", "literature", "seriousness"],
        createdBy: "ClinixAI",
        createdAt: new Date().toISOString(),
      },
      {
        id: "VAL-002",
        title: "Invalid literature case due to missing adverse event",
        category: "VALIDITY_ASSESSMENT",
        pmid: "TEST-PMID-002",
        inputText:
          "A clinical review discussed paracetamol use in adult patients. No adverse event was described.",
        expected: {
          productNames: ["paracetamol"],
          adverseEvents: [],
          patientPresent: true,
          reporterPresent: true,
          validCaseExpected: false,
        },
        tags: ["invalid", "missing-ae"],
        createdBy: "ClinixAI",
        createdAt: new Date().toISOString(),
      },
      {
        id: "VAL-003",
        title: "Pregnancy literature case detection",
        category: "PREGNANCY_DETECTION",
        pmid: "TEST-PMID-003",
        inputText:
          "A pregnant woman was exposed to amoxicillin during the first trimester and later reported nausea.",
        expected: {
          productNames: ["amoxicillin"],
          adverseEvents: ["nausea"],
          patientPresent: true,
          pregnancyExpected: true,
          validCaseExpected: true,
        },
        tags: ["pregnancy", "special-population"],
        createdBy: "ClinixAI",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  static loadFromJson(jsonText: string): ValidationScenario[] {
    try {
      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        throw new Error("Validation dataset must be an array.");
      }

      return parsed.map((scenario, index) =>
        this.normalizeScenario(scenario, index)
      );
    } catch (error) {
      throw new Error(
        `Failed to load validation scenarios: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private static normalizeScenario(
    scenario: Partial<ValidationScenario>,
    index: number
  ): ValidationScenario {
    if (!scenario.title) {
      throw new Error(`Scenario at index ${index} is missing title.`);
    }

    if (!scenario.category) {
      throw new Error(`Scenario at index ${index} is missing category.`);
    }

    if (!scenario.expected) {
      throw new Error(`Scenario at index ${index} is missing expected output.`);
    }

    return {
      id: scenario.id ?? `SCENARIO-${index + 1}`,
      title: scenario.title,
      category: scenario.category,
      pmid: scenario.pmid,
      inputText: scenario.inputText,
      language: scenario.language ?? "en",
      expected: scenario.expected,
      actual: scenario.actual,
      tags: scenario.tags ?? [],
      createdBy: scenario.createdBy ?? "ClinixAI",
      createdAt: scenario.createdAt ?? new Date().toISOString(),
    };
  }
}