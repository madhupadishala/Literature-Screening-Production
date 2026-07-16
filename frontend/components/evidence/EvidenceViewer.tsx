"use client";

import type { EvidencePackage } from "@/lib/evidence/evidence-types";

interface EvidenceViewerProps {
  evidencePackage: EvidencePackage;
}

export default function EvidenceViewer({
  evidencePackage,
}: EvidenceViewerProps) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-xl font-semibold">Evidence Package</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-sm text-gray-500">Package ID</div>
          <div className="font-medium">
            {evidencePackage.metadata.packageId}
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-500">Status</div>
          <div className="font-medium">
            {evidencePackage.metadata.status}
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-500">Hash</div>
          <div className="font-mono text-sm">
            {evidencePackage.metadata.packageHash}
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-500">Version</div>
          <div className="font-medium">
            {evidencePackage.metadata.packageVersion}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-slate-50 p-4">
        <h3 className="font-semibold">Article</h3>

        <div className="mt-3 text-sm">
          <strong>Title:</strong> {evidencePackage.article.title ?? "-"}
        </div>

        <div className="mt-2 text-sm">
          <strong>PMID:</strong> {evidencePackage.article.pmid ?? "-"}
        </div>

        <div className="mt-2 text-sm">
          <strong>DOI:</strong> {evidencePackage.article.doi ?? "-"}
        </div>

        <div className="mt-2 text-sm">
          <strong>Full Text:</strong>{" "}
          {evidencePackage.article.hasFullText ? "Available" : "Not available"}
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-slate-50 p-4">
        <h3 className="font-semibold">AI Runtime</h3>

        <div className="mt-3 text-sm">
          <strong>Agent:</strong> {evidencePackage.aiExecution.agentName}
        </div>

        <div className="mt-2 text-sm">
          <strong>Model:</strong> {evidencePackage.aiExecution.modelName}
        </div>

        <div className="mt-2 text-sm">
          <strong>Confidence:</strong>{" "}
          {(evidencePackage.aiExecution.confidence * 100).toFixed(0)}%
        </div>
      </div>

      <div className="mt-6 rounded-lg border bg-slate-50 p-4">
        <h3 className="font-semibold">RAG Context</h3>

        <div className="mt-3 text-sm">
          {evidencePackage.ragContext.summary}
        </div>

        <div className="mt-4 space-y-3">
          {evidencePackage.ragContext.chunks.map((chunk) => (
            <div key={chunk.id} className="rounded border bg-white p-3">
              <div className="flex justify-between text-sm">
                <strong>{chunk.source}</strong>
                <span>{chunk.priority}</span>
              </div>

              <div className="mt-2 text-sm text-gray-700">
                {chunk.content.substring(0, 300)}
                {chunk.content.length > 300 ? "..." : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {evidencePackage.review && (
        <div className="mt-6 rounded-lg border bg-emerald-50 p-4">
          <h3 className="font-semibold">Human Review</h3>

          <div className="mt-3 text-sm">
            <strong>Status:</strong> {evidencePackage.review.status}
          </div>

          <div className="mt-2 text-sm">
            <strong>Decision:</strong>{" "}
            {evidencePackage.review.reviewerDecision?.decision ?? "-"}
          </div>

          <div className="mt-2 text-sm">
            <strong>Comments:</strong>{" "}
            {evidencePackage.review.reviewerDecision?.comments ?? "-"}
          </div>
        </div>
      )}
    </div>
  );
}