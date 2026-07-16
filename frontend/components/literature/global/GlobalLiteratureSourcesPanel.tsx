"use client";

import { useEffect, useState } from "react";

import type {
  LiteratureRoutingResult,
  LiteratureSourceStatus,
} from "@/lib/literature/global/literature-source-types";

interface ApiResponse {
  status: LiteratureSourceStatus;
  result: LiteratureRoutingResult;
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

export default function GlobalLiteratureSourcesPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadSources() {
    const response = await fetch("/api/literature/global-sources", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function routeJapanSources() {
    const response = await fetch("/api/literature/global-sources", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        countries: ["JP"],
        languages: ["ja"],
      }),
    });

    const result = (await response.json()) as ApiResponse;

    setData({
      status: data?.status ?? {
        totalSources: 0,
        enabledSources: 0,
      },
      result: result.result,
    });
  }

  useEffect(() => {
    void loadSources();
  }, []);

  const status = data?.status;
  const sources = data?.result.sources ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Global Literature Intelligence
          </h2>

          <p className="text-sm text-slate-500">
            Routes literature searches to global and regional literature sources.
          </p>
        </div>

        <button
          type="button"
          onClick={routeJapanSources}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Route Japan Sources
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Total Sources"
          value={status?.totalSources ?? 0}
        />

        <MetricCard
          title="Enabled Sources"
          value={status?.enabledSources ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Routed Sources
        </div>

        <div className="divide-y divide-slate-100">
          {sources.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No literature sources routed.
            </div>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="space-y-2 p-4">
                <div className="font-semibold text-slate-900">
                  {source.name}
                </div>

                <div className="text-sm text-slate-500">
                  Type: {source.type} · Country: {source.country ?? "Global"} ·
                  Language: {source.language ?? "Any"}
                </div>

                <div className="text-xs text-slate-500">
                  License Required: {source.requiresLicense ? "Yes" : "No"} ·
                  Enabled: {source.enabled ? "Yes" : "No"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}