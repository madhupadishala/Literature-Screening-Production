import type {
  AIObservabilityStatus,
  AIRequestMetric,
} from "./ai-observability-types";

class AIMetricsStore {
  private metrics: AIRequestMetric[] = [];

  add(metric: AIRequestMetric) {
    this.metrics.unshift(metric);

    return metric;
  }

  list(limit = 50) {
    return this.metrics.slice(0, limit);
  }

  summary(): AIObservabilityStatus {
    const totalRequests = this.metrics.length;

    const successfulRequests = this.metrics.filter(
      (item) => item.status === "success",
    ).length;

    const failedRequests = totalRequests - successfulRequests;

    const totalTokens = this.metrics.reduce(
      (sum, item) => sum + item.totalTokens,
      0,
    );

    const estimatedCost = this.metrics.reduce(
      (sum, item) => sum + item.estimatedCost,
      0,
    );

    const averageLatency =
      totalRequests === 0
        ? 0
        : Math.round(
            this.metrics.reduce(
              (sum, item) => sum + item.latencyMs,
              0,
            ) / totalRequests,
          );

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      totalTokens,
      estimatedCost: Number(
        estimatedCost.toFixed(6),
      ),
      averageLatency,
    };
  }
}

export const aiMetrics = new AIMetricsStore();