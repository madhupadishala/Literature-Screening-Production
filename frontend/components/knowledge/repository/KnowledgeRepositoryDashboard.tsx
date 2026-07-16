"use client";

import { useEffect, useState } from "react";

import type {
  KnowledgeDocument,
  KnowledgeRepositoryStatus,
} from "@/lib/knowledge/repository/knowledge-types";

interface ApiResponse {
  status: KnowledgeRepositoryStatus;
  documents: KnowledgeDocument[];
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

export default function KnowledgeRepositoryDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadDocuments() {
    const response = await fetch("/api/knowledge/repository", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function createDemoKnowledge() {
    await fetch("/api/knowledge/repository", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "EMA GVP Module VI",
        category: "regulatory_guidance",
        version: "Rev.3",
        sourceAuthority: "EMA",
        country: "EU",
        language: "en",
        effectiveDate: "2025-01-01",
        tags: ["GVP", "ICSR", "Literature"],
        summary: "Literature screening guidance.",
        content:
          "This is a placeholder document for Production Beta.",
      }),
    });

    await loadDocuments();
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  const status = data?.status;
  const documents = data?.documents ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Knowledge Repository
          </h2>

          <p className="text-sm text-slate-500">
            Governed repository for SOPs, regulations, work instructions,
            business rules and operational knowledge.
          </p>
        </div>

        <button
          type="button"
          onClick={createDemoKnowledge}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Add Demo Knowledge
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Total Documents"
          value={status?.totalDocuments ?? 0}
        />

        <MetricCard
          title="Active"
          value={status?.activeDocuments ?? 0}
        />

        <MetricCard
          title="Global"
          value={status?.globalDocuments ?? 0}
        />

        <MetricCard
          title="Tenant"
          value={status?.tenantDocuments ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Repository
        </div>

        <div className="divide-y divide-slate-100">
          {documents.length === 0 ? (
            <div className="p-6 text-slate-500">
              No knowledge documents available.
            </div>
          ) : (
            documents.map((document) => (
              <div key={document.id} className="space-y-2 p-4">
                <div className="font-semibold">
                  {document.title}
                </div>

                <div className="text-sm text-slate-500">
                  {document.category} · Version {document.version}
                </div>

                <div className="text-sm text-slate-700">
                  {document.summary ?? "No summary"}
                </div>

                <div className="text-xs text-slate-500">
                  {document.status} ·{" "}
                  {document.sourceAuthority ?? "Unknown Authority"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}