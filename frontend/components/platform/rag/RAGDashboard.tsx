"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  RAGResponse,
  RAGStatus,
} from "@/lib/platform/rag/rag-types";

interface ApiResponse {
  status: RAGStatus;
  history: RAGResponse[];
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

export default function RAGDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadDashboard() {
    const response = await fetch("/api/platform/rag", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function generateDemoContext() {
    await fetch("/api/platform/rag", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request: {
          tenantId: "demo",
          query: "Summarize the literature findings.",
        },
        sources: [
          {
            id: "1",
            sourceType: "knowledge",
            title: "Knowledge Base",
            content:
              "Literature screening follows the enterprise workflow.",
          },
          {
            id: "2",
            sourceType: "product_master",
            title: "Product Master",
            content: "Paracetamol is configured for this tenant.",
          },
        ],
      }),
    });

    await loadDashboard();
  }

  useDeferredLoad(loadDashboard);

  const status = data?.status;
  const history = data?.history ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Enterprise RAG
          </h2>

          <p className="text-sm text-slate-500">
            Enterprise context builder for AI retrieval.
          </p>
        </div>

        <button
          onClick={generateDemoContext}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Generate Demo Context
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Contexts Built"
          value={status?.contextsBuilt ?? 0}
        />

        <MetricCard
          title="Average Sources"
          value={status?.averageSourcesPerContext ?? 0}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Recent Contexts
        </div>

        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No RAG contexts generated.
            </div>
          ) : (
            history.map((item, index) => (
              <div
                key={index}
                className="p-4"
              >
                <div className="font-semibold">
                  {item.context.query}
                </div>

                <div className="mt-2 text-sm text-slate-500">
                  Sources: {item.context.sources.length}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
