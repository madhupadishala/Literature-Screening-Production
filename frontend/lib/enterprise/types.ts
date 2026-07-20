export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type SecuritySeverity = "low" | "medium" | "high" | "critical";

export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  packageId?: string;
  method: string;
  path: string;
  clientIp?: string;
  startedAt: string;
}

export interface HealthProbeOutput {
  status: HealthStatus;
  message: string;
  details?: unknown;
}

export interface HealthCheckResult extends HealthProbeOutput {
  name: string;
  critical: boolean;
  latencyMs: number;
  checkedAt: string;
}

export interface HealthReport {
  service: string;
  version: string;
  environment: string;
  status: HealthStatus;
  checkedAt: string;
  uptimeSeconds: number;
  checks: HealthCheckResult[];
}

export interface HistogramSnapshot {
  count: number;
  sum: number;
  min: number;
  max: number;
  average: number;
}

export interface MetricsSnapshot {
  generatedAt: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
}

export interface SecurityAuditEvent {
  id: string;
  occurredAt: string;
  type: string;
  severity: SecuritySeverity;
  outcome: "allowed" | "blocked" | "failed" | "observed";
  requestId?: string;
  correlationId?: string;
  tenantId?: string;
  packageId?: string;
  actor?: string;
  sourceIp?: string;
  path?: string;
  message: string;
  metadata?: unknown;
}

export interface SelfTestCheck {
  name: string;
  passed: boolean;
  details?: unknown;
}

export interface SelfTestReport {
  passed: boolean;
  checkedAt: string;
  checks: SelfTestCheck[];
}
