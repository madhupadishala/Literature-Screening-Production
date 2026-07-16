import { ValidationEngine } from "../engine/ValidationEngine";
import type { BenchmarkResult } from "../types/BenchmarkResult";
import type {
  ActualValidationOutput,
  ValidationRunConfig,
  ValidationScenario,
} from "../types/ValidationTypes";

type BenchmarkExecutor = (
  scenario: ValidationScenario
) => Promise<ActualValidationOutput>;

function createRunId(): string {
  return `VAL-${Date.now()}`;
}

export class BenchmarkRunner {
  private readonly engine: ValidationEngine;

  constructor(executor?: BenchmarkExecutor) {
    this.engine = new ValidationEngine(executor);
  }

  async runBenchmark(params: {
    scenarios: ValidationScenario[];
    sprint: string;
    datasetName: string;
    modelName?: string;
    promptVersion?: string;
    knowledgeVersion?: string;
    embeddingVersion?: string;
  }): Promise<BenchmarkResult> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();

    const config: ValidationRunConfig = {
      runId: createRunId(),
      sprint: params.sprint,
      datasetName: params.datasetName,
      modelName: params.modelName,
      promptVersion: params.promptVersion,
      knowledgeVersion: params.knowledgeVersion,
      embeddingVersion: params.embeddingVersion,
      strictMode: true,
      createdAt: startedAt,
    };

    const validationRun = await this.engine.run(params.scenarios, config);

    const completedAtMs = Date.now();
    const durationMs = completedAtMs - startedAtMs;

    const failures = validationRun.scenarioResults
      .filter((result) => result.status === "FAIL")
      .map((result) => ({
        scenarioId: result.scenarioId,
        title: result.title,
        reason: "One or more expected fields did not match actual output.",
        category: result.category,
      }));

    return {
      config,
      summary: {
        runId: validationRun.runId,
        sprint: validationRun.sprint,
        datasetName: validationRun.datasetName,
        totalScenarios: validationRun.totalScenarios,
        passed: validationRun.passed,
        warnings: validationRun.warnings,
        failed: validationRun.failed,
        overallAccuracy: validationRun.overallAccuracy,
        overallPrecision: validationRun.overallPrecision,
        overallRecall: validationRun.overallRecall,
        overallF1Score: validationRun.overallF1Score,
        averageConfidence: validationRun.averageConfidence,
      },
      timing: {
        startedAt,
        completedAt: new Date(completedAtMs).toISOString(),
        durationMs,
        averageScenarioDurationMs:
          params.scenarios.length === 0 ? 0 : durationMs / params.scenarios.length,
      },
      failures,
      scenarioResults: validationRun.scenarioResults,
      validationRun,
    };
  }
}