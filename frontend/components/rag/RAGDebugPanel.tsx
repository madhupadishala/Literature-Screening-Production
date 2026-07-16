"use client";

import { useState } from "react";

import type { RAGMergedContext } from "@/lib/rag/rag-types";

export default function RAGDebugPanel() {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [query, setQuery] = useState("");
  const [productName, setProductName] = useState("");
  const [country, setCountry] = useState("");
  const [processArea, setProcessArea] = useState("literature_screening");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<RAGMergedContext | null>(null);
  const [error, setError] = useState("");

  async function buildContext() {
    setLoading(true);
    setError("");
    setContext(null);

    try {
      const response = await fetch("/api/rag/context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          query,
          productName: productName || undefined,
          country: country || undefined,
          processArea: processArea || undefined,
          searchMode: "hybrid",
          topK: 10,
          minScore: 0,
        }),
      });

      const json = await response.json();

      if (!json.success) {
        throw new Error(json.message);
      }

      setContext(json.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unknown RAG context error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-6">
      <h2 className="mb-5 text-xl font-semibold">RAG Debug Panel</h2>

      <div className="grid gap-4">
        <input
          className="rounded-md border p-2"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          placeholder="Tenant ID"
        />

        <textarea
          className="h-28 rounded-md border p-2"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ask for enterprise context..."
        />

        <div className="grid gap-4 md:grid-cols-3">
          <input
            className="rounded-md border p-2"
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            placeholder="Product name"
          />

          <input
            className="rounded-md border p-2"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder="Country"
          />

          <input
            className="rounded-md border p-2"
            value={processArea}
            onChange={(event) => setProcessArea(event.target.value)}
            placeholder="Process area"
          />
        </div>

        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          disabled={loading}
          onClick={buildContext}
        >
          {loading ? "Building Context..." : "Build RAG Context"}
        </button>
      </div>

      {error && (
        <div className="mt-5 rounded-md bg-red-100 p-3 text-red-700">
          {error}
        </div>
      )}

      {context && (
        <div className="mt-6 space-y-5">
          <div className="rounded-lg border bg-white p-4">
            <div className="text-sm text-gray-500">Summary</div>
            <div className="mt-1 font-medium">{context.summary}</div>
          </div>

          {context.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="font-medium text-amber-800">Warnings</div>

              <ul className="mt-2 list-disc pl-5 text-sm text-amber-700">
                {context.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border bg-white p-4">
            <div className="mb-2 font-medium">Source Breakdown</div>

            <div className="grid gap-2 md:grid-cols-3">
              {Object.entries(context.sourceBreakdown).map(([source, count]) => (
                <div key={source} className="rounded-md bg-slate-100 p-3 text-sm">
                  <div className="font-semibold">{source}</div>
                  <div>{count} chunk(s)</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {context.chunks.map((chunk) => (
              <div key={chunk.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">{chunk.source}</div>
                    <div className="text-xs text-gray-500">
                      Priority: {chunk.priority} • Score:{" "}
                      {chunk.score.toFixed(4)}
                    </div>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                    {chunk.metadata.versionId ?? "latest"}
                  </span>
                </div>

                <p className="mt-3 text-sm text-gray-700">
                  {chunk.content.substring(0, 350)}
                  {chunk.content.length > 350 ? "..." : ""}
                </p>

                <div className="mt-3 text-xs text-gray-500">
                  {chunk.retrievalReason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}