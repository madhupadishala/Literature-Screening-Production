"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
interface HealthResponse {
  success: boolean;
  generatedAt: string;

  system: {
    status: string;
    uptime: number;
  };

  performance: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDurationMs: number;
  };

  errors: {
    info: number;
    warning: number;
    error: number;
    critical: number;
  };
}

export default function SystemHealthDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [loading, setLoading] = useState(true);

  async function loadHealth() {
    const response = await fetch("/api/system/health");

    const json = await response.json();

    setHealth(json);

    setLoading(false);
  }

  useDeferredLoad(loadHealth);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading health...
      </div>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-xl font-semibold">
        System Health
      </h2>

      <div className="grid gap-4 md:grid-cols-4">

        <Metric
          title="Status"
          value={health.system.status}
        />

        <Metric
          title="Uptime"
          value={`${Math.round(
            health.system.uptime,
          )} sec`}
        />

        <Metric
          title="Executions"
          value={health.performance.totalExecutions}
        />

        <Metric
          title="Avg Time"
          value={`${health.performance.averageDurationMs.toFixed(
            1,
          )} ms`}
        />

      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">

        <Metric
          title="Info"
          value={health.errors.info}
        />

        <Metric
          title="Warnings"
          value={health.errors.warning}
        />

        <Metric
          title="Errors"
          value={health.errors.error}
        />

        <Metric
          title="Critical"
          value={health.errors.critical}
        />

      </div>

    </div>
  );
}

function Metric({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">

      <div className="text-sm text-gray-500">
        {title}
      </div>

      <div className="mt-2 text-2xl font-bold">
        {value}
      </div>

    </div>
  );
}
