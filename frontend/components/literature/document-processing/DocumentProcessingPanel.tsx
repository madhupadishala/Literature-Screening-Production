"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  DocumentProcessingStatus,
  PDFProcessingResult,
} from "@/lib/literature/document-processing/document-processing-types";

interface ApiResponse {
  status: DocumentProcessingStatus;
  documents: PDFProcessingResult[];
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

export default function DocumentProcessingPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadDocuments() {
    const response = await fetch("/api/literature/document-processing", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function processDemoDocument() {
    await fetch("/api/literature/document-processing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        pmid: "00000001",
        fileName: "demo-literature-source.pdf",
      }),
    });

    await loadDocuments();
  }

  useDeferredLoad(loadDocuments);

  const status = data?.status;
  const documents = data?.documents ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            PDF & OCR Pipeline
          </h2>

          <p className="text-sm text-slate-500">
            Processes source PDFs into clean extracted text for downstream AI.
          </p>
        </div>

        <button
          type="button"
          onClick={processDemoDocument}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Process Demo PDF
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Processed Documents"
          value={status?.processedDocuments ?? 0}
        />

        <MetricCard
          title="Average OCR Confidence"
          value={`${status?.averageOCRConfidence ?? 0}%`}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Processing History
        </div>

        <div className="divide-y divide-slate-100">
          {documents.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No documents processed.
            </div>
          ) : (
            documents.map((document) => (
              <div key={`${document.pmid}-${document.fileName}`} className="p-4">
                <div className="font-semibold text-slate-900">
                  {document.fileName}
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  PMID: {document.pmid} · Pages: {document.pageCount} · OCR:{" "}
                  {document.ocr.confidence}%
                </div>

                <div className="mt-3 rounded bg-slate-50 p-3 text-sm text-slate-700">
                  {document.ocr.extractedText}
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Processed: {new Date(document.processedAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
