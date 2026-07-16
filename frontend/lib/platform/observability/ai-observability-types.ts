export type AIRequestStatus =
  | "success"
  | "failed";

export interface AIRequestMetric {
  id: string;
  tenantId: string;
  provider: string;
  model: string;
  promptCategory: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  status: AIRequestStatus;
  createdAt: string;
}

export interface AIObservabilityStatus {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  estimatedCost: number;
  averageLatency: number;
}