import type {
  ScenarioValidationResult,
  ValidationRunConfig,
  ValidationRunResult,
} from "./ValidationTypes";

export interface BenchmarkTiming {
  startedAt: string;
  completedAt?: string;
  durationMs: number;
  averageScenarioDurationMs: number;
}

export interface BenchmarkCost {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
}

export interface BenchmarkFailure {
  scenarioId: string;
  title: string;
  reason: string;
  category?: string;
}

export interface BenchmarkSummary {
  runId: string;
  sprint: string;
  datasetName: string;
  totalScenarios: number;
  passed: number;
  warnings: number;
  failed: number;
  overallAccuracy: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1Score: number;
  averageConfidence?: number;
}

export interface BenchmarkResult {
  config: ValidationRunConfig;
  summary: BenchmarkSummary;
  timing: BenchmarkTiming;
  cost?: BenchmarkCost;
  failures: BenchmarkFailure[];
  scenarioResults: ScenarioValidationResult[];
  validationRun: ValidationRunResult;
}

export interface BenchmarkHistoryItem {
  runId: string;
  sprint: string;
  datasetName: string;
  createdAt: string;
  overallAccuracy: number;
  overallPrecision: number;
  overallRecall: number;
  overallF1Score: number;
  averageConfidence?: number;
  totalScenarios: number;
  failed: number;
  durationMs?: number;
  modelName?: string;
  promptVersion?: string;
  knowledgeVersion?: string;
  embeddingVersion?: string;
}