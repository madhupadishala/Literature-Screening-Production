"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  EvidenceNormalizationResult,
  EvidenceNormalizationStatus,
} from "@/lib/literature/evidence-normalization/evidence-normalization-types";

interface ApiResponse {
  status: EvidenceNormalizationStatus;
  packages: EvidenceNormalizationResult[];
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

export default function EvidenceNormalizationDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadPackages() {
    const response = await fetch(
      "/api/literature/evidence-normalization",
      {
        cache: "no-store",
      },
    );

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function normalizeDemoEvidence() {
    await fetch("/api/literature/evidence-normalization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        sourceId: "PMID-12345678",
        sourceType: "abstract",
        title: "Paracetamol induced liver injury",
        originalLanguage: "en",
        content:
          "   Patient developed liver injury after paracetamol exposure.   ",
        metadata: {
          journal: "Demo Journal",
          year: 2026,
        },
      }),
    });

    await loadPackages();
  }

  useDeferredLoad(loadPackages);

  const status = data?.status;
  const packages = data?.packages ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Evidence Normalization
          </h2>

          <p className="text-sm text-slate-500">
            Converts literature evidence into a standardized Evidence Package
            for downstream AI agents.
          </p>
        </div>

        <button
          type="button"
          onClick={normalizeDemoEvidence}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Normalize Demo Evidence
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Evidence Packages"
          value={status?.totalPackages ?? 0}
        />

        <MetricCard
          title="Warnings"
          value={status?.warningCount ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Normalized Evidence
        </div>

        <div className="divide-y divide-slate-100">
          {packages.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No evidence packages generated.
            </div>
          ) : (
            packages.map((item) => (
              <div key={item.package.id} className="space-y-3 p-4">
                <div className="font-semibold">
                  {item.package.title}
                </div>

                <div className="text-sm text-slate-500">
                  {item.package.sourceType} · {item.package.language}
                </div>

                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  {item.package.normalizedText}
                </div>

                {item.warnings.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    {item.warnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
