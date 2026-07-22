"use client";

import type { KnowledgeSearchResult } from "@/lib/knowledge/knowledge-types";

interface KnowledgeResultCardProps {
  result: KnowledgeSearchResult;
}

export default function KnowledgeResultCard({ result }: KnowledgeResultCardProps) {
  const { citation } = result;

  return (
    <article
      style={{
        border: "1px solid #d7dde5",
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        background: "#ffffff",
      }}
    >
      <h4 style={{ marginTop: 0 }}>{citation.title}</h4>
      <p>
        <strong>Knowledge Object:</strong> {citation.knowledgeObjectId}
        {" · "}
        <strong>Domain:</strong> {citation.domain}
        {" · "}
        <strong>Version:</strong> {citation.version}
      </p>
      <p>
        <strong>Section:</strong> {citation.section}
      </p>
      <p>{result.content}</p>
      <p style={{ marginBottom: 4 }}>
        <strong>Regulatory reference:</strong> {citation.regulatoryReference}
      </p>
      <small>
        Governed citation {citation.citationId} · Match {result.matchedBy} · Score{" "}
        {result.score.toFixed(4)}
      </small>
    </article>
  );
}
