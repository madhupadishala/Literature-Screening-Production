"use client";

import { useState } from "react";

import type {
  VectorSearchResponse,
  VectorSearchResult,
} from "@/lib/vector/vector-types";

export default function VectorSearchDebugPanel() {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] =
    useState<VectorSearchResponse | null>(null);
  const [error, setError] = useState("");

  async function executeSearch() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/vector/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          query,
          mode: "hybrid",
          topK: 10,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.message);
      }

      setResponse(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function renderResult(result: VectorSearchResult) {
    return (
      <div
        key={result.document.id}
        className="rounded-lg border p-4 bg-white shadow-sm mb-3"
      >
        <div className="flex justify-between">
          <strong>{result.document.metadata.sourceType}</strong>

          <span className="text-sm text-gray-500">
            {result.score.toFixed(4)}
          </span>
        </div>

        <div className="mt-2 text-sm">
          {result.document.content.substring(0, 250)}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          {result.explanation}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-slate-50 p-6">

      <h2 className="text-xl font-semibold mb-5">
        Vector Search Debug Panel
      </h2>

      <div className="grid gap-4">

        <input
          className="border rounded-md p-2"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          placeholder="Tenant"
        />

        <textarea
          className="border rounded-md p-2 h-32"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Semantic search query..."
        />

        <button
          className="rounded-md bg-blue-600 text-white px-4 py-2"
          disabled={loading}
          onClick={executeSearch}
        >
          {loading ? "Searching..." : "Run Vector Search"}
        </button>

      </div>

      {error && (
        <div className="mt-5 rounded bg-red-100 p-3 text-red-700">
          {error}
        </div>
      )}

      {response && (
        <div className="mt-6">

          <div className="mb-4 text-sm text-gray-600">
            Query:
            <strong> {response.query}</strong>

            {" • "}
            Results:
            <strong> {response.totalResults}</strong>
          </div>

          {response.results.length === 0 && (
            <div className="text-gray-500">
              No semantic matches found.
            </div>
          )}

          {response.results.map(renderResult)}
        </div>
      )}
    </div>
  );
}