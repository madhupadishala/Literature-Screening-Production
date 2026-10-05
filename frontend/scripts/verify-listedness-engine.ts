import dataset from "../lib/listedness-intelligence/faers-gold-scenarios.json";
import { assessListedness } from "../lib/listedness-intelligence/listedness-engine";

type Scenario = {
  id: string;
  edgeCaseCategory: string;
  input: {
    reportedEvent: string;
    eventKind?: "CLINICAL_EVENT" | "LAB";
    caseContext?: {
      milkExposure?: boolean | null;
      foodExposure?: boolean | null;
      grapefruitExposure?: boolean | null;
      alcoholExposure?: boolean | null;
      coExposures?: string[];
      deniedCoExposures?: string[];
    };
    labelFixture: {
      text: string;
      section?: string;
      documentType?: string;
      subjectProduct?: string;
    };
  };
  expected: {
    listedness: "LISTED" | "UNLISTED" | "UNRESOLVED";
  };
};

const scenarios = dataset.scenarios as Scenario[];
const failures: Array<Record<string, unknown>> = [];
const byCategory = new Map<string, { total: number; passed: number }>();

for (const scenario of scenarios) {
  const result = assessListedness({
    reportedEvent: scenario.input.reportedEvent,
    eventKind: scenario.input.eventKind,
    caseContext: scenario.input.caseContext,
    labelEvidence: [scenario.input.labelFixture],
  });

  const bucket = byCategory.get(scenario.edgeCaseCategory) ?? { total: 0, passed: 0 };
  bucket.total += 1;

  if (result.listedness === scenario.expected.listedness) {
    bucket.passed += 1;
  } else {
    failures.push({
      id: scenario.id,
      category: scenario.edgeCaseCategory,
      event: scenario.input.reportedEvent,
      expected: scenario.expected.listedness,
      actual: result.listedness,
      reasonCode: result.reasonCode,
      rationale: result.rationale,
      label: scenario.input.labelFixture.text,
    });
  }
  byCategory.set(scenario.edgeCaseCategory, bucket);
}

console.log(`Listedness reference scenarios: ${scenarios.length}`);
for (const [category, result] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`${category}: ${result.passed}/${result.total}`);
}

if (failures.length) {
  console.error(`Listedness verification failed: ${failures.length} scenario(s)`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Listedness verification passed: 100/100 controlled FAERS-derived scenarios.");
