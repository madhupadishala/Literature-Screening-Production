"use client";

import type { KnowledgeSearchResult } from "@/lib/knowledge/knowledge-types";

type Props = {
  result: KnowledgeSearchResult;
};

export default function KnowledgeResultCard({
  result,
}: Props) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <h4>{result.document.title}</h4>

      <p>
        <strong>Type:</strong> {result.document.type}
      </p>

      <p>
        <strong>Version:</strong> {result.document.version}
      </p>

      <p>{result.chunk.text}</p>

      <small>Score: {result.score}</small>
    </div>
  );
}