"use client";

import { useState } from "react";

import KnowledgeResultCard from "./KnowledgeResultCard";

import type {
  KnowledgeSearchResult,
} from "@/lib/knowledge/knowledge-types";

export default function KnowledgeSearchPanel() {
  const [query, setQuery] = useState("");

  const [results, setResults] = useState<
    KnowledgeSearchResult[]
  >([]);

  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;

    setLoading(true);

    const response = await fetch("/api/knowledge/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "tenant-clinixai-default",
        query,
        topK: 10,
      }),
    });

    const data = await response.json();

    setResults(data.results ?? []);

    setLoading(false);
  }

  return (
    <div>
      <h2>Knowledge Search</h2>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <input
          value={query}
          placeholder="Search SOPs, Product Rules..."
          onChange={(e) => setQuery(e.target.value)}
        />

        <button onClick={search}>
          Search
        </button>
      </div>

      {loading && <p>Searching...</p>}

      {!loading &&
        results.map((result) => (
          <KnowledgeResultCard
            key={result.chunk.id}
            result={result}
          />
        ))}
    </div>
  );
}