"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type { InfrastructureStatus } from "@/lib/platform/monitoring/health-types";

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
      {status}
    </span>
  );
}

function formatUptime(seconds?: number) {
  if (!seconds) {
    return "0s";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export default function SystemHealthDashboard() {
  const [data, setData] = useState<InfrastructureStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadHealth() {
    setLoading(true);

    try {
      const response = await fetch("/api/system/platform-health", {
        cache: "no-store",
      });

      const result = (await response.json()) as InfrastructureStatus;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  useDeferredLoad(loadHealth);

  const services = data?.services ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Infrastructure Monitoring
          </h2>
          <p className="text-sm text-slate-500">
            Platform health, service heartbeat and readiness diagnostics.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHealth}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard title="Overall" value={data?.overall ?? "unknown"} />
        <MetricCard title="Healthy" value={data?.summary.healthy ?? 0} />
        <MetricCard title="Degraded" value={data?.summary.degraded ?? 0} />
        <MetricCard title="Unhealthy" value={data?.summary.unhealthy ?? 0} />
        <MetricCard title="Uptime" value={formatUptime(data?.uptimeSeconds)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Service Registry {loading ? "· Loading..." : ""}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Component</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Heartbeat</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {services.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>
                    No services registered.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={service.serviceId}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {service.serviceId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {service.component}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {service.version ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={service.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(service.checkedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
