"use client";

import { useState } from "react";

import type { SearchResponse } from "@/lib/search/search-types";
import SearchResults from "./SearchResults";

export default function GlobalSearch() {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"keyword" | "semantic" | "hybrid">("hybrid");

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");

  async function runSearch() {
    setLoading(true);
    setError("");
    setResponse(null);

    try {
      const apiResponse = await fetch("/api/search/global", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          query,
          mode,
          topK: 20,
          minScore: 0,
        }),
      });

      const json = await apiResponse.json();

      if (!json.success) {
        throw new Error(json.message);
      }

      setResponse(json.data);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unknown search error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="rounded-xl border bg-white p-6">
        <h2 className="mb-5 text-2xl font-semibold">
          Enterprise Global Search
        </h2>

        <div className="grid gap-4">
          <input
            className="rounded-md border p-2"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            placeholder="Tenant ID"
          />

          <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
            <input
              className="rounded-md border p-2"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search across hits, screening, evidence, workflow..."
            />

            <select
              className="rounded-md border p-2"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as "keyword" | "semantic" | "hybrid")
              }
            >
              <option value="hybrid">Hybrid</option>
              <option value="keyword">Keyword</option>
              <option value="semantic">Semantic</option>
            </select>

            <button
              className="rounded-md bg-indigo-600 px-5 py-2 text-white disabled:opacity-60"
              disabled={loading}
              onClick={runSearch}
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-md bg-red-100 p-3 text-red-700">
            {error}
          </div>
        )}
      </div>

      <SearchResults response={response} />
    </div>
  );
}