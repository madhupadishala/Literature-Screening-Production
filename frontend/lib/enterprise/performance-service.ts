import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

import { metrics } from "./metrics";

interface AggregateRow {
  ai_executions_24h: string | number;
  ai_failures_24h: string | number;
  ai_average_ms: string | number | null;
  ai_p95_ms: string | number | null;
  ai_max_ms: string | number | null;
  searches_24h: string | number;
  search_average_ms: string | number | null;
  search_p95_ms: string | number | null;
  results_24h: string | number;
  packages_24h: string | number;
}

interface OperationRow {
  operation: string;
  executions: string | number;
  failures: string | number;
  average_ms: string | number | null;
  p95_ms: string | number | null;
  maximum_ms: string | number | null;
}

interface SlowRow {
  id: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  latency_ms: number;
  created_at: string;
  package_key: string | null;
}

export interface PerformanceReport {
  generatedAt: string;
  window: "24h";
  pool: { total: number; idle: number; waiting: number; utilizationPercent: number };
  throughput: { searches: number; results: number; packages: number; aiExecutions: number };
  latency: {
    aiAverageMs: number;
    aiP95Ms: number;
    aiMaximumMs: number;
    searchAverageMs: number;
    searchP95Ms: number;
  };
  reliability: { aiFailures: number; aiFailureRatePercent: number };
  operations: Array<{
    operation: string;
    executions: number;
    failures: number;
    averageMs: number;
    p95Ms: number;
    maximumMs: number;
  }>;
  slowOperations: Array<{
    id: string;
    operation: string;
    provider: string;
    model: string;
    status: string;
    latencyMs: number;
    occurredAt: string;
    packageKey?: string;
  }>;
  budgets: Array<{
    metric: string;
    target: string;
    actual: string;
    status: "pass" | "warning" | "fail";
  }>;
  runtimeMetrics: ReturnType<typeof metrics.snapshot>;
}

function number(value: string | number | null): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function getPerformanceReport(tenantId: string): Promise<PerformanceReport> {
  const pool = getPostgresPool();
  const [aggregateResult, operationResult, slowResult] = await Promise.all([
    pool.query<AggregateRow>(
      `SELECT
         (SELECT count(*) FROM ai_executions WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours') AS ai_executions_24h,
         (SELECT count(*) FROM ai_executions WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours' AND status = 'failed') AS ai_failures_24h,
         (SELECT avg(latency_ms) FROM ai_executions WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours' AND latency_ms IS NOT NULL) AS ai_average_ms,
         (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM ai_executions WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours' AND latency_ms IS NOT NULL) AS ai_p95_ms,
         (SELECT max(latency_ms) FROM ai_executions WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours') AS ai_max_ms,
         (SELECT count(*) FROM ad_hoc_literature_searches WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours') AS searches_24h,
         (SELECT avg(duration_ms) FROM ad_hoc_literature_searches WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours' AND duration_ms IS NOT NULL) AS search_average_ms,
         (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM ad_hoc_literature_searches WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours' AND duration_ms IS NOT NULL) AS search_p95_ms,
         (SELECT count(*) FROM ad_hoc_literature_results WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours') AS results_24h,
         (SELECT count(*) FROM literature_packages WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours') AS packages_24h`,
      [tenantId],
    ),
    pool.query<OperationRow>(
      `SELECT execution_type AS operation, count(*) AS executions,
         count(*) FILTER (WHERE status = 'failed') AS failures,
         avg(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS average_ms,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
           FILTER (WHERE latency_ms IS NOT NULL) AS p95_ms,
         max(latency_ms) AS maximum_ms
       FROM ai_executions
       WHERE tenant_id = $1 AND created_at >= now() - interval '24 hours'
       GROUP BY execution_type ORDER BY execution_type`,
      [tenantId],
    ),
    pool.query<SlowRow>(
      `SELECT execution.id, execution.execution_type AS operation, execution.provider,
         execution.model, execution.status, execution.latency_ms, execution.created_at,
         package.package_key
       FROM ai_executions execution
       LEFT JOIN literature_packages package
         ON package.id = execution.package_id AND package.tenant_id = execution.tenant_id
       WHERE execution.tenant_id = $1 AND execution.latency_ms IS NOT NULL
         AND execution.created_at >= now() - interval '24 hours'
       ORDER BY execution.latency_ms DESC LIMIT 20`,
      [tenantId],
    ),
  ]);
  const row = aggregateResult.rows[0];
  const total = pool.totalCount;
  const idle = pool.idleCount;
  const waiting = pool.waitingCount;
  const aiExecutions = number(row.ai_executions_24h);
  const aiFailures = number(row.ai_failures_24h);
  const aiP95 = number(row.ai_p95_ms);
  const searchP95 = number(row.search_p95_ms);
  const utilization = total > 0 ? Math.round(((total - idle) / total) * 10000) / 100 : 0;
  const failureRate = aiExecutions > 0 ? Math.round((aiFailures / aiExecutions) * 10000) / 100 : 0;
  const report: PerformanceReport = {
    generatedAt: new Date().toISOString(),
    window: "24h",
    pool: { total, idle, waiting, utilizationPercent: utilization },
    throughput: {
      searches: number(row.searches_24h),
      results: number(row.results_24h),
      packages: number(row.packages_24h),
      aiExecutions,
    },
    latency: {
      aiAverageMs: number(row.ai_average_ms),
      aiP95Ms: aiP95,
      aiMaximumMs: number(row.ai_max_ms),
      searchAverageMs: number(row.search_average_ms),
      searchP95Ms: searchP95,
    },
    reliability: { aiFailures, aiFailureRatePercent: failureRate },
    operations: operationResult.rows.map((item) => ({
      operation: item.operation,
      executions: number(item.executions),
      failures: number(item.failures),
      averageMs: number(item.average_ms),
      p95Ms: number(item.p95_ms),
      maximumMs: number(item.maximum_ms),
    })),
    slowOperations: slowResult.rows.map((item) => ({
      id: item.id,
      operation: item.operation,
      provider: item.provider,
      model: item.model,
      status: item.status,
      latencyMs: item.latency_ms,
      occurredAt: new Date(item.created_at).toISOString(),
      packageKey: item.package_key || undefined,
    })),
    budgets: [
      budget("AI p95 latency", 10000, aiP95, "ms"),
      budget("Search p95 latency", 15000, searchP95, "ms"),
      budget("AI failure rate", 2, failureRate, "%"),
      budget("Pool waiting requests", 0, waiting, "requests"),
    ],
    runtimeMetrics: metrics.snapshot(),
  };
  await persistPerformanceSnapshot(tenantId, report).catch(() => undefined);
  return report;
}

function budget(
  metric: string,
  target: number,
  actual: number,
  unit: string,
): PerformanceReport["budgets"][number] {
  const status = actual <= target ? "pass" : actual <= target * 1.25 ? "warning" : "fail";
  return { metric, target: `≤ ${target} ${unit}`, actual: `${actual} ${unit}`, status };
}

async function persistPerformanceSnapshot(
  tenantId: string,
  report: PerformanceReport,
): Promise<void> {
  await getPostgresPool().query(
    `INSERT INTO performance_snapshots (
       tenant_id, pool_total, pool_idle, pool_waiting, ai_p95_ms, search_p95_ms, snapshot_payload
     ) SELECT $1, $2, $3, $4, $5, $6, $7::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM performance_snapshots WHERE tenant_id = $1
           AND captured_at >= now() - interval '5 minutes'
       )`,
    [
      tenantId,
      report.pool.total,
      report.pool.idle,
      report.pool.waiting,
      report.latency.aiP95Ms,
      report.latency.searchP95Ms,
      JSON.stringify({
        throughput: report.throughput,
        latency: report.latency,
        reliability: report.reliability,
        budgets: report.budgets,
      }),
    ],
  );
}
