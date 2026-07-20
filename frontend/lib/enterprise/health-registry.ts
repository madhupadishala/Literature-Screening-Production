import { getRuntimeConfig } from "./environment";
import { normalizeError } from "./errors";
import { metrics } from "./metrics";
import { withTimeout } from "./timeout";
import type {
  HealthCheckResult,
  HealthProbeOutput,
  HealthReport,
  HealthStatus,
} from "./types";

export interface HealthProbeDefinition {
  name: string;
  critical: boolean;
  timeoutMs?: number;
  probe: () => Promise<HealthProbeOutput>;
}

export class HealthRegistry {
  private readonly probes = new Map<string, HealthProbeDefinition>();

  register(definition: HealthProbeDefinition): void {
    this.probes.set(definition.name, definition);
  }

  unregister(name: string): void {
    this.probes.delete(name);
  }

  listProbeNames(): string[] {
    return [...this.probes.keys()].sort();
  }

  async run(): Promise<HealthReport> {
    const config = getRuntimeConfig();
    const checks = await Promise.all(
      [...this.probes.values()].map((definition) => this.runProbe(definition)),
    );
    const status = aggregateStatus(checks);

    metrics.setGauge("health_status", status === "healthy" ? 1 : status === "degraded" ? 0.5 : 0);
    metrics.setGauge("health_checks_total", checks.length);
    metrics.setGauge(
      "health_checks_failed",
      checks.filter((check) => check.status === "unhealthy").length,
    );

    return {
      service: config.appName,
      version: config.appVersion,
      environment: config.environment,
      status,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    };
  }

  private async runProbe(
    definition: HealthProbeDefinition,
  ): Promise<HealthCheckResult> {
    const started = performance.now();
    const timeoutMs =
      definition.timeoutMs ?? getRuntimeConfig().healthProbeTimeoutMs;

    try {
      const output = await withTimeout(
        `health probe ${definition.name}`,
        definition.probe(),
        timeoutMs,
      );

      return {
        ...output,
        name: definition.name,
        critical: definition.critical,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      const normalized = normalizeError(error);
      return {
        name: definition.name,
        critical: definition.critical,
        status: "unhealthy",
        message: normalized.message,
        details: { code: normalized.code, retryable: normalized.retryable },
        latencyMs: Math.round(performance.now() - started),
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

function aggregateStatus(checks: HealthCheckResult[]): HealthStatus {
  if (checks.some((check) => check.critical && check.status === "unhealthy")) {
    return "unhealthy";
  }

  if (checks.some((check) => check.status !== "healthy")) return "degraded";
  return "healthy";
}

declare global {
  var __clinixHealthRegistry: HealthRegistry | undefined;
}

export const healthRegistry =
  globalThis.__clinixHealthRegistry ??
  (globalThis.__clinixHealthRegistry = new HealthRegistry());
