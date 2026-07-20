import type { AIProviderType } from "./ai-types";

export interface AIMetricRecord {
  id: string;
  operation: "hits" | "screening" | "health" | "self_test";
  provider: AIProviderType;
  model: string;
  success: boolean;
  latencyMs: number;
  attempts: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requestId: string;
  correlationId?: string;
  errorCode?: string;
  recordedAt: string;
}

export interface AIMetricsSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  averageLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  byProvider: Record<string, number>;
  lastRecordedAt?: string;
}

const MAX_RECORDS = 1_000;
const records: AIMetricRecord[] = [];

function createMetricId(): string {
  return `ai-metric-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordAIMetric(
  input: Omit<AIMetricRecord, "id" | "recordedAt">,
): AIMetricRecord {
  const record: AIMetricRecord = {
    ...input,
    id: createMetricId(),
    recordedAt: new Date().toISOString(),
  };

  records.unshift(record);

  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }

  return record;
}

export function listAIMetrics(limit = 100): AIMetricRecord[] {
  const safeLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), MAX_RECORDS)
    : 100;

  return records.slice(0, safeLimit);
}

export function getAIMetricsSummary(): AIMetricsSummary {
  const totalRequests = records.length;
  const successfulRequests = records.filter((record) => record.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const totalLatencyMs = records.reduce((sum, record) => sum + record.latencyMs, 0);
  const totalPromptTokens = records.reduce(
    (sum, record) => sum + (record.promptTokens ?? 0),
    0,
  );
  const totalCompletionTokens = records.reduce(
    (sum, record) => sum + (record.completionTokens ?? 0),
    0,
  );
  const totalTokens = records.reduce(
    (sum, record) => sum + (record.totalTokens ?? 0),
    0,
  );
  const byProvider = records.reduce<Record<string, number>>((summary, record) => {
    summary[record.provider] = (summary[record.provider] ?? 0) + 1;
    return summary;
  }, {});

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: totalRequests === 0 ? 0 : successfulRequests / totalRequests,
    averageLatencyMs: totalRequests === 0 ? 0 : Math.round(totalLatencyMs / totalRequests),
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    byProvider,
    lastRecordedAt: records[0]?.recordedAt,
  };
}

export function clearAIMetrics(): void {
  records.length = 0;
}
