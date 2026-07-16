import { AccuracyCalculator } from "../metrics/AccuracyCalculator";
import type {
  ActualValidationOutput,
  ScenarioValidationResult,
  ValidationRunConfig,
  ValidationRunResult,
  ValidationScenario,
} from "../types/ValidationTypes";

type ScenarioExecutor = (
  scenario: ValidationScenario
) => Promise<ActualValidationOutput>;

export class ValidationEngine {
  private readonly executor: ScenarioExecutor;

  constructor(executor?: ScenarioExecutor) {
    this.executor = executor ?? this.defaultExecutor;
  }

  async run(
    scenarios: ValidationScenario[],
    config: ValidationRunConfig
  ): Promise<ValidationRunResult> {
    const startedAt = new Date().toISOString();
    const scenarioResults: ScenarioValidationResult[] = [];

    try {
      for (const scenario of scenarios) {
        const actual = scenario.actual ?? (await this.executor(scenario));

        const result = AccuracyCalculator.compareScenario({
          scenarioId: scenario.id,
          title: scenario.title,
          category: scenario.category,
          expected: scenario.expected,
          actual,
        });

        scenarioResults.push(result);
      }

      const aggregate = AccuracyCalculator.aggregate(scenarioResults);

      return {
        runId: config.runId,
        sprint: config.sprint,
        datasetName: config.datasetName,
        status: "COMPLETED",
        startedAt,
        completedAt: new Date().toISOString(),
        totalScenarios: scenarios.length,
        passed: aggregate.passed,
        warnings: aggregate.warnings,
        failed: aggregate.failed,
        overallAccuracy: aggregate.overallAccuracy,
        overallPrecision: aggregate.overallPrecision,
        overallRecall: aggregate.overallRecall,
        overallF1Score: aggregate.overallF1Score,
        averageConfidence: aggregate.averageConfidence,
        scenarioResults,
      };
    } catch (error) {
      return {
        runId: config.runId,
        sprint: config.sprint,
        datasetName: config.datasetName,
        status: "FAILED",
        startedAt,
        completedAt: new Date().toISOString(),
        totalScenarios: scenarios.length,
        passed: 0,
        warnings: 0,
        failed: scenarios.length,
        overallAccuracy: 0,
        overallPrecision: 0,
        overallRecall: 0,
        overallF1Score: 0,
        scenarioResults,
      };
    }
  }

  private async defaultExecutor(
    scenario: ValidationScenario
  ): Promise<ActualValidationOutput> {
    return {
      ...scenario.expected,
      confidence: 1,
      reasoning:
        "Default validation executor used. Replace with AI pipeline executor when Sprint 51+ engines are connected.",
      evidence: [
        {
          sourceId: scenario.pmid ?? scenario.id,
          sourceType: scenario.pmid ? "PMID" : "USER_RULE",
          confidence: 1,
          modelName: "default-validation-executor",
        },
      ],
      warnings: [
        "This scenario used the default executor. Connect real AI extraction pipeline for production validation.",
      ],
    };
  }
}