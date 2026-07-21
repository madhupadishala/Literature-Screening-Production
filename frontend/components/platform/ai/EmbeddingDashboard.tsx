"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  EmbeddingEngineStatus,
  EmbeddingResponse,
} from "@/lib/platform/ai/embeddings/embedding-types";

interface EmbeddingApiResponse {
  status: EmbeddingEngineStatus;
  history: EmbeddingResponse[];
}

function MetricCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function EmbeddingDashboard() {
  const [data, setData] = useState<EmbeddingApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadEmbeddings() {
    setLoading(true);

    try {
      const response = await fetch("/api/platform/ai/embeddings", {
        cache: "no-store",
      });

      const result = (await response.json()) as EmbeddingApiResponse;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  async function generateTestEmbedding() {
    await fetch("/api/platform/ai/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        text: "Paracetamol literature abstract with adverse event and patient safety signal context.",
        metadata: {
          sourceType: "diagnostic",
          sourceId: "embedding-dashboard-test",
          tags: ["test", "diagnostic"],
        },
      }),
    });

    await loadEmbeddings();
  }

  useDeferredLoad(loadEmbeddings);

  const status = data?.status;
  const history = data?.history ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Embedding Engine
          </h2>
          <p className="text-sm text-slate-500">
            Standardized semantic vector generation for documents, knowledge
            and source packages.
          </p>
        </div>

        <button
          type="button"
          onClick={generateTestEmbedding}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Generate Test Embedding
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          title="Default Provider"
          value={status?.defaultProvider ?? "—"}
        />
        <MetricCard title="Default Model" value={status?.defaultModel ?? "—"} />
        <MetricCard
          title="Dimensions"
          value={status?.defaultDimensions ?? 0}
        />
        <MetricCard
          title="Total Embeddings"
          value={status?.totalEmbeddings ?? 0}
        />
        <MetricCard
          title="Avg Latency"
          value={`${status?.averageLatencyMs ?? 0}ms`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
          Recent Embeddings {loading ? "· Loading..." : ""}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Embedding</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Dimensions</th>
                <th className="px-4 py-3">Characters</th>
                <th className="px-4 py-3">Latency</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No embeddings generated.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {item.id}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.provider}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.model}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.vector.dimensions}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.inputCharacters}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.latencyMs}ms
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
