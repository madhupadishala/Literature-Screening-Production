"use client";

import { useEffect, useState } from "react";

import type { VectorStoreStatus } from "@/lib/platform/vector/vector-types";

interface VectorApiResponse {
  status: VectorStoreStatus;
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function VectorDashboard() {
  const [status, setStatus] = useState<VectorStoreStatus | null>(null);

  async function loadStatus() {
    const response = await fetch("/api/platform/vector", {
      cache: "no-store",
    });

    const result = (await response.json()) as VectorApiResponse;

    setStatus(result.status);
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Production Vector Store
        </h2>

        <p className="text-sm text-slate-500">
          Enterprise semantic storage layer for AI retrieval.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Provider"
          value={status?.provider ?? "memory"}
        />

        <MetricCard
          title="Stored Vectors"
          value={status?.totalVectors ?? 0}
        />

        <MetricCard
          title="Namespaces"
          value={status?.namespaces ?? 0}
        />
      </div>
    </section>
  );
}