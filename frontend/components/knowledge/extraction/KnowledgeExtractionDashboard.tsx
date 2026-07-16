"use client";

import { useEffect, useState } from "react";

import type {
  KnowledgeExtractionResult,
  KnowledgeExtractionStatus,
} from "@/lib/knowledge/extraction/knowledge-extraction-types";

interface ApiResponse {
  status: KnowledgeExtractionStatus;
  extractions: KnowledgeExtractionResult[];
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

export default function KnowledgeExtractionDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadExtractions() {
    const response = await fetch("/api/knowledge/extraction", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function runDemoExtraction() {
    await fetch("/api/knowledge/extraction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        documentId: "demo-gvp-vi",
        title: "EMA GVP Module VI",
        content:
          "A valid ICSR requires an identifiable patient, identifiable reporter, suspect medicinal product and adverse event.",
      }),
    });

    await loadExtractions();
  }

  useEffect(() => {
    void loadExtractions();
  }, []);

  const status = data?.status;
  const extractions = data?.extractions ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Knowledge Extraction
          </h2>

          <p className="text-sm text-slate-500">
            Converts SOPs, work instructions and regulatory guidance into
            structured knowledge objects.
          </p>
        </div>

        <button
          type="button"
          onClick={runDemoExtraction}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Demo Extraction
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Processed Documents"
          value={status?.processedDocuments ?? 0}
        />

        <MetricCard
          title="Extracted Objects"
          value={status?.extractedObjects ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Extracted Knowledge Objects
        </div>

        <div className="divide-y divide-slate-100">
          {extractions.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No knowledge extractions available.
            </div>
          ) : (
            extractions.map((extraction) => (
              <div key={extraction.documentId} className="space-y-3 p-4">
                <div className="font-semibold text-slate-900">
                  Document: {extraction.documentId}
                </div>

                <div className="text-sm text-slate-500">
                  Objects: {extraction.objects.length} · Extracted:{" "}
                  {new Date(extraction.extractedAt).toLocaleString()}
                </div>

                <div className="space-y-2">
                  {extraction.objects.map((object) => (
                    <div
                      key={object.id}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="font-semibold text-slate-900">
                        {object.title}
                      </div>

                      <div className="text-xs uppercase text-slate-400">
                        {object.type}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {object.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}