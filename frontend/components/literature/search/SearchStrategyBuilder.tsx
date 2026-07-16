"use client";

import { useEffect, useState } from "react";

import type {
  SearchStrategyResult,
  SearchStrategyStatus,
} from "@/lib/literature/search/search-strategy-types";

interface ApiResponse {
  status: SearchStrategyStatus;
  strategies: SearchStrategyResult[];
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

export default function SearchStrategyBuilder() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadStrategies() {
    const response = await fetch("/api/literature/search-strategy", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function createDemoStrategy() {
    await fetch("/api/literature/search-strategy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        strategyName: "Paracetamol Safety",
        productNames: [
          "Paracetamol",
          "Acetaminophen",
          "Tylenol",
          "Panadol",
        ],
        inclusionTerms: [
          "adverse event",
          "drug safety",
          "toxicity",
          "pregnancy",
        ],
        exclusionTerms: [
          "animal",
          "veterinary",
        ],
      }),
    });

    await loadStrategies();
  }

  useEffect(() => {
    void loadStrategies();
  }, []);

  const status = data?.status;
  const strategies = data?.strategies ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Search Strategy Builder
          </h2>

          <p className="text-sm text-slate-500">
            Enterprise PubMed search strategy generation.
          </p>
        </div>

        <button
          type="button"
          onClick={createDemoStrategy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Generate Demo Strategy
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <MetricCard
          title="Strategies Built"
          value={status?.totalStrategies ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Generated Strategies
        </div>

        <div className="divide-y divide-slate-100">
          {strategies.length === 0 ? (
            <div className="p-6 text-slate-500">
              No strategies generated.
            </div>
          ) : (
            strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="p-4 space-y-2"
              >
                <div className="font-semibold">
                  {strategy.strategyName}
                </div>

                <div className="rounded bg-slate-50 p-3 font-mono text-sm break-all">
                  {strategy.query}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}