"use client";

import { useState } from "react";

import KnowledgeResultCard from "./KnowledgeResultCard";
import type { KnowledgeSearchResult } from "@/lib/knowledge/knowledge-types";

interface KnowledgeSearchApiResponse {
  success?: boolean;
  results?: KnowledgeSearchResult[];
  message?: string;
}

export default function KnowledgeSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KnowledgeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(): Promise<void> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: normalizedQuery, topK: 10, mode: "hybrid" }),
      });
      const payload = (await response.json()) as KnowledgeSearchApiResponse;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "Governed knowledge search failed.");
      }
      setResults(payload.results ?? []);
    } catch (searchError) {
      setResults([]);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Governed knowledge search failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>Governed Knowledge Search</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          value={query}
          placeholder="Search approved PV knowledge..."
          aria-label="Knowledge search query"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
        />
        <button type="button" disabled={loading || !query.trim()} onClick={() => void search()}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {!loading && !error && results.length === 0 ? (
        <p>No approved knowledge results are currently displayed.</p>
      ) : null}
      {results.map((result) => (
        <KnowledgeResultCard key={result.citation.chunkId} result={result} />
      ))}
    </section>
  );
}
