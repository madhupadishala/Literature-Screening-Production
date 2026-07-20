export type PerformanceOperation =
  | "literature_workflow"
  | "article_processing"
  | "duplicate_check"
  | "screening"
  | "batch"
  | "cache";

export interface PerformanceMetric {
  id: string;
  operation: PerformanceOperation;
  success: boolean;
  durationMs: number;
  tenantId?: string;
  correlationId?: string;
  itemCount?: number;
  concurrency?: number;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface PerformanceSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  successRate: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  averageItemsPerOperation: number;
  lastRecordedAt?: string;
  byOperation: Record<string, number>;
}

const MAX_METRICS = 5_000;
const metrics: PerformanceMetric[] = [];

function percentile(
  sortedValues: number[],
  percentileValue: number,
): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(
      0,
      Math.ceil(percentileValue * sortedValues.length) - 1,
    ),
  );

  return sortedValues[index] ?? 0;
}

export function recordPerformanceMetric(
  input: Omit<PerformanceMetric, "id" | "recordedAt">,
): PerformanceMetric {
  const metric: PerformanceMetric = {
    ...input,
    id: `performance-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`,
    recordedAt: new Date().toISOString(),
  };

  metrics.unshift(metric);

  if (metrics.length > MAX_METRICS) {
    metrics.length = MAX_METRICS;
  }

  return metric;
}

export function listPerformanceMetrics(
  limit = 100,
): PerformanceMetric[] {
  const safeLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.min(Math.floor(limit), MAX_METRICS)
      : 100;

  return metrics.slice(0, safeLimit);
}

export function getPerformanceSummary(): PerformanceSummary {
  const totalOperations = metrics.length;
  const successfulOperations = metrics.filter(
    (metric) => metric.success,
  ).length;
  const failedOperations = totalOperations - successfulOperations;
  const durations = metrics
    .map((metric) => metric.durationMs)
    .sort((left, right) => left - right);
  const totalDuration = durations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const totalItems = metrics.reduce(
    (sum, metric) => sum + (metric.itemCount ?? 0),
    0,
  );
  const byOperation = metrics.reduce<Record<string, number>>(
    (summary, metric) => {
      summary[metric.operation] =
        (summary[metric.operation] ?? 0) + 1;
      return summary;
    },
    {},
  );

  return {
    totalOperations,
    successfulOperations,
    failedOperations,
    successRate:
      totalOperations === 0
        ? 0
        : successfulOperations / totalOperations,
    averageDurationMs:
      totalOperations === 0
        ? 0
        : Math.round(totalDuration / totalOperations),
    p50DurationMs: percentile(durations, 0.5),
    p95DurationMs: percentile(durations, 0.95),
    p99DurationMs: percentile(durations, 0.99),
    averageItemsPerOperation:
      totalOperations === 0
        ? 0
        : Number((totalItems / totalOperations).toFixed(2)),
    lastRecordedAt: metrics[0]?.recordedAt,
    byOperation,
  };
}

export function clearPerformanceMetrics(): void {
  metrics.length = 0;
}
