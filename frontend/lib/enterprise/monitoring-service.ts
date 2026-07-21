import { getPostgresPool } from "@/lib/database/postgres";

import { listCircuitBreakers, type CircuitBreakerStatus } from "./circuit-breaker";
import { registerDefaultDependencyProbes } from "./dependency-probes";
import { getRuntimeConfig } from "./environment";
import { healthRegistry } from "./health-registry";
import { metrics } from "./metrics";
import { securityAudit } from "./security-audit";
import type { HealthReport, MetricsSnapshot } from "./types";

interface OperationalRow {
  audit_events_24h: string | number;
  failures_24h: string | number;
  authorization_denials_24h: string | number;
  packages_total: string | number;
  workflow_states: Record<string, number> | null;
}

interface IncidentRow {
  id: string;
  event_type: string;
  event_category: string;
  outcome: string;
  occurred_at: string;
  package_key: string | null;
  details: Record<string, unknown>;
}

export interface MonitoringSummary {
  service: { name: string; version: string; environment: string; region: string; buildSha: string };
  health: HealthReport;
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryBytes: { rss: number; heapTotal: number; heapUsed: number; external: number };
  };
  circuits: CircuitBreakerStatus[];
  metrics: MetricsSnapshot;
  security: { retainedEvents: number };
  operations: {
    available: boolean;
    auditEvents24h: number;
    failures24h: number;
    authorizationDenials24h: number;
    packagesTotal: number;
    workflowStates: Record<string, number>;
    recentIncidents: Array<{
      id: string;
      eventType: string;
      eventCategory: string;
      outcome: string;
      occurredAt: string;
      packageKey?: string;
      details: Record<string, unknown>;
    }>;
  };
  generatedAt: string;
}

export async function getMonitoringSummary(tenantId: string): Promise<MonitoringSummary> {
  registerDefaultDependencyProbes();
  const config = getRuntimeConfig();
  const health = await healthRegistry.run();
  const memory = process.memoryUsage();
  metrics.setGauge("process_heap_used_bytes", memory.heapUsed);
  metrics.setGauge("process_heap_total_bytes", memory.heapTotal);
  metrics.setGauge("process_rss_bytes", memory.rss);
  metrics.setGauge("process_uptime_seconds", process.uptime());
  metrics.setGauge("security_events_retained", securityAudit.count());

  const operations = await getOperationalReliability(tenantId).catch(() => ({
    available: false,
    auditEvents24h: 0,
    failures24h: 0,
    authorizationDenials24h: 0,
    packagesTotal: 0,
    workflowStates: {},
    recentIncidents: [],
  }));
  const summary: MonitoringSummary = {
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
    security: { retainedEvents: securityAudit.count() },
    operations,
    generatedAt: new Date().toISOString(),
  };
  await persistSnapshot(tenantId, summary).catch(() => undefined);
  return summary;
}

async function getOperationalReliability(
  tenantId: string,
): Promise<MonitoringSummary["operations"]> {
  const pool = getPostgresPool();
  const [aggregate, incidents] = await Promise.all([
    pool.query<OperationalRow>(
      `SELECT
         (SELECT count(*) FROM audit_events WHERE tenant_id = $1 AND occurred_at >= now() - interval '24 hours') AS audit_events_24h,
         (SELECT count(*) FROM audit_events WHERE tenant_id = $1 AND occurred_at >= now() - interval '24 hours'
           AND lower(outcome) IN ('failure', 'failed', 'denied', 'error')) AS failures_24h,
         (SELECT count(*) FROM audit_events WHERE tenant_id = $1 AND occurred_at >= now() - interval '24 hours'
           AND event_type = 'AUTHORIZATION_DENIED') AS authorization_denials_24h,
         (SELECT count(*) FROM literature_packages WHERE tenant_id = $1) AS packages_total,
         (SELECT jsonb_object_agg(workflow_state, state_count) FROM (
           SELECT workflow_state, count(*)::integer AS state_count
           FROM literature_workflow_state WHERE tenant_id = $1 GROUP BY workflow_state
         ) states) AS workflow_states`,
      [tenantId],
    ),
    pool.query<IncidentRow>(
      `SELECT event.id, event.event_type, event.event_category, event.outcome,
         event.occurred_at, package.package_key, event.details
       FROM audit_events event
       LEFT JOIN literature_packages package
         ON package.id = event.package_id AND package.tenant_id = event.tenant_id
       WHERE event.tenant_id = $1
         AND (lower(event.outcome) IN ('failure', 'failed', 'denied', 'error')
           OR lower(event.event_type) ~ '(fail|error|denied|critical)')
       ORDER BY event.occurred_at DESC LIMIT 10`,
      [tenantId],
    ),
  ]);
  const row = aggregate.rows[0];
  return {
    available: true,
    auditEvents24h: Number(row.audit_events_24h),
    failures24h: Number(row.failures_24h),
    authorizationDenials24h: Number(row.authorization_denials_24h),
    packagesTotal: Number(row.packages_total),
    workflowStates: row.workflow_states || {},
    recentIncidents: incidents.rows.map((incident) => ({
      id: incident.id,
      eventType: incident.event_type,
      eventCategory: incident.event_category,
      outcome: incident.outcome,
      occurredAt: new Date(incident.occurred_at).toISOString(),
      packageKey: incident.package_key || undefined,
      details: incident.details || {},
    })),
  };
}

async function persistSnapshot(tenantId: string, summary: MonitoringSummary): Promise<void> {
  const criticalFailures = summary.health.checks.filter(
    (check) => check.critical && check.status !== "healthy",
  ).length;
  const degradedChecks = summary.health.checks.filter(
    (check) => check.status === "degraded",
  ).length;
  await getPostgresPool().query(
    `INSERT INTO reliability_snapshots (
       tenant_id, overall_status, critical_failures, degraded_checks, snapshot_payload
     ) SELECT $1, $2, $3, $4, $5::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM reliability_snapshots
         WHERE tenant_id = $1 AND captured_at >= now() - interval '5 minutes'
           AND overall_status = $2
       )`,
    [
      tenantId,
      summary.health.status,
      criticalFailures,
      degradedChecks,
      JSON.stringify({
        health: summary.health,
        operations: summary.operations,
        circuits: summary.circuits,
        service: summary.service,
      }),
    ],
  );
}
