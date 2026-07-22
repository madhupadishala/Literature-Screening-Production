import scenarioData from "./approved-scenarios.json";

import type { PharmaceuticalScenario } from "./types";

interface EquivalentNameGroup {
  canonical: string;
  terms: string[];
}

interface DistinctSubstanceGroup {
  family: string;
  canonical: string;
  terms: string[];
}

export interface DistinctSaltRelationship {
  reportedTerm: string;
  canonical: string;
  rationale: string;
  matchMode: "EXACT_PRESENTATION_REQUIRED";
}

export const PHARMACEUTICAL_KNOWLEDGE_VERSION = scenarioData.knowledgeVersion;
export const APPROVED_PHARMACEUTICAL_SCENARIOS =
  scenarioData.scenarios as PharmaceuticalScenario[];
export const EQUIVALENT_NAME_GROUPS =
  scenarioData.equivalentNames as EquivalentNameGroup[];
export const COMMON_SALT_TOKENS = scenarioData.commonSaltTokens as string[];
export const DISTINCT_SALT_RELATIONSHIPS =
  scenarioData.distinctSaltRelationships as DistinctSaltRelationship[];
export const DISTINCT_SUBSTANCE_GROUPS =
  scenarioData.distinctSubstances as DistinctSubstanceGroup[];

export function pharmaceuticalScenarioContext(): Record<string, unknown> {
  return {
    knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
    scenarios: APPROVED_PHARMACEUTICAL_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      rule: scenario.rule,
      expectedDecision: scenario.expectedDecision,
      prohibitedConclusions: scenario.prohibitedConclusions,
      manualReviewWhen: scenario.manualReviewWhen,
    })),
  };
}
