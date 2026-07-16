export type PerformanceMetricType =
  | "api"
  | "ai"
  | "workflow"
  | "database"
  | "vector"
  | "rag";

export interface PerformanceMetric {
  id: string;

  tenantId?: string;

  type: PerformanceMetricType;

  operation: string;

  durationMs: number;

  success: boolean;

  metadata?: Record<string, unknown>;

  timestamp: string;
}

export interface PerformanceSummary {
  totalExecutions: number;

  successfulExecutions: number;

  failedExecutions: number;

  averageDurationMs: number;

  fastestDurationMs: number;

  slowestDurationMs: number;
}

const metrics = new Map<string, PerformanceMetric>();

function createMetricId(): string {
  return `metric-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PerformanceMonitor {
  record(
    metric: Omit<PerformanceMetric, "id" | "timestamp">,
  ): PerformanceMetric {
    const record: PerformanceMetric = {
      ...metric,

      id: createMetricId(),

      timestamp: new Date().toISOString(),
    };

    metrics.set(record.id, record);

    return record;
  }

  list(
    type?: PerformanceMetricType,
  ): PerformanceMetric[] {
    const values = Array.from(metrics.values());

    if (!type) {
      return values;
    }

    return values.filter(
      (metric) => metric.type === type,
    );
  }

  summary(
    type?: PerformanceMetricType,
  ): PerformanceSummary {
    const list = this.list(type);

    if (list.length === 0) {
      return {
        totalExecutions: 0,

        successfulExecutions: 0,

        failedExecutions: 0,

        averageDurationMs: 0,

        fastestDurationMs: 0,

        slowestDurationMs: 0,
      };
    }

    const durations = list.map(
      (item) => item.durationMs,
    );

    const totalDuration = durations.reduce(
      (sum, value) => sum + value,
      0,
    );

    return {
      totalExecutions: list.length,

      successfulExecutions: list.filter(
        (item) => item.success,
      ).length,

      failedExecutions: list.filter(
        (item) => !item.success,
      ).length,

      averageDurationMs:
        totalDuration / list.length,

      fastestDurationMs:
        Math.min(...durations),

      slowestDurationMs:
        Math.max(...durations),
    };
  }

  clear(): void {
    metrics.clear();
  }
}

export const performanceMonitor =
  new PerformanceMonitor();