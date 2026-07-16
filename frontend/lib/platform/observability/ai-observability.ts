import { aiMetrics } from "./ai-metrics";

import type {
  AIObservabilityStatus,
  AIRequestMetric,
} from "./ai-observability-types";

class AIObservability {
  record(metric: AIRequestMetric) {
    return aiMetrics.add(metric);
  }

  listMetrics(limit = 50) {
    return aiMetrics.list(limit);
  }

  getStatus(): AIObservabilityStatus {
    return aiMetrics.summary();
  }
}

export const aiObservability =
  new AIObservability();