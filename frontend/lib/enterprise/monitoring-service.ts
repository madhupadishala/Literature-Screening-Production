import { listCircuitBreakers } from "./circuit-breaker";
import { registerDefaultDependencyProbes } from "./dependency-probes";
import { getRuntimeConfig } from "./environment";
import { healthRegistry } from "./health-registry";
import { metrics } from "./metrics";
import { securityAudit } from "./security-audit";

export async function getMonitoringSummary(): Promise<unknown> {
  registerDefaultDependencyProbes();

  const config = getRuntimeConfig();
  const health = await healthRegistry.run();
  const memory = process.memoryUsage();

  metrics.setGauge("process_heap_used_bytes", memory.heapUsed);
  metrics.setGauge("process_heap_total_bytes", memory.heapTotal);
  metrics.setGauge("process_rss_bytes", memory.rss);
  metrics.setGauge("process_uptime_seconds", process.uptime());
  metrics.setGauge("security_events_retained", securityAudit.count());

  return {
    service: {
      name: config.appName,
      version: config.appVersion,
      environment: config.environment,
      region: config.region,
      buildSha: config.buildSha,
    },
    health,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
    },
    circuits: listCircuitBreakers(),
    metrics: metrics.snapshot(),
    security: {
      retainedEvents: securityAudit.count(),
    },
    generatedAt: new Date().toISOString(),
  };
}
