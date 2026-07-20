"use client";

import { useCallback, useEffect, useState } from "react";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface HealthCheck {
  name: string;
  status: HealthStatus;
  critical: boolean;
  latencyMs: number;
  message: string;
}

interface MonitoringSummary {
  service: {
    name: string;
    version: string;
    environment: string;
    region: string;
    buildSha: string;
  };
  health: {
    status: HealthStatus;
    checkedAt: string;
    uptimeSeconds: number;
    checks: HealthCheck[];
  };
  process: {
    uptimeSeconds: number;
    nodeVersion: string;
    memoryBytes: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
  circuits: Array<{
    name: string;
    state: string;
    consecutiveFailures: number;
  }>;
  security: {
    retainedEvents: number;
  };
  generatedAt: string;
}

interface ApiPayload {
  ok: boolean;
  data?: MonitoringSummary;
  error?: { message?: string };
}

export default function ReliabilityDashboard(): React.ReactElement {
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/monitoring/summary", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as ApiPayload;

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error?.message || "Monitoring data is unavailable.");
      }

      setSummary(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Monitoring data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading) {
    return <div className="rounded-xl border bg-white p-6">Loading reliability status…</div>;
  }

  if (error || !summary) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">Reliability data could not be loaded.</p>
        <p className="mt-1 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const memoryPercentage =
    summary.process.memoryBytes.heapTotal > 0
      ? Math.round(
          (summary.process.memoryBytes.heapUsed /
            summary.process.memoryBytes.heapTotal) *
            100,
        )
      : 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="System status" value={summary.health.status.toUpperCase()} />
        <MetricCard label="Uptime" value={formatDuration(summary.process.uptimeSeconds)} />
        <MetricCard label="Heap utilization" value={`${memoryPercentage}%`} />
        <MetricCard label="Security events" value={String(summary.security.retainedEvents)} />
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Dependency health</h2>
            <p className="mt-1 text-sm text-slate-500">
              Production readiness checks for the AI, knowledge, vector and evidence services.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-3 font-medium">Dependency</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Critical</th>
                <th className="px-3 py-3 font-medium">Latency</th>
                <th className="px-3 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.health.checks.map((check) => (
                <tr key={check.name}>
                  <td className="px-3 py-3 font-medium text-slate-900">{check.name}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={check.status} />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{check.critical ? "Yes" : "No"}</td>
                  <td className="px-3 py-3 text-slate-600">{check.latencyMs} ms</td>
                  <td className="max-w-xl px-3 py-3 text-slate-600">{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <InfoPanel
          title="Deployment identity"
          rows={[
            ["Service", summary.service.name],
            ["Version", summary.service.version],
            ["Environment", summary.service.environment],
            ["Region", summary.service.region],
            ["Build", summary.service.buildSha],
            ["Node", summary.process.nodeVersion],
          ]}
        />
        <InfoPanel
          title="Circuit breakers"
          rows={
            summary.circuits.length
              ? summary.circuits.map((circuit) => [
                  circuit.name,
                  `${circuit.state} · ${circuit.consecutiveFailures} failures`,
                ])
              : [["Status", "No circuit breakers have been activated yet."]]
          }
        />
      </section>

      <p className="text-right text-xs text-slate-400">
        Last refreshed {new Date(summary.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: HealthStatus }): React.ReactElement {
  const classes =
    status === "healthy"
      ? "bg-emerald-100 text-emerald-800"
      : status === "degraded"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {status}
    </span>
  );
}

function InfoPanel({
  title,
  rows,
}: {
  title: string;
  rows: string[][];
}): React.ReactElement {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <dl className="mt-4 divide-y divide-slate-100">
        {rows.map(([label, value]) => (
          <div key={`${label}-${value}`} className="flex justify-between gap-4 py-3 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
