"use client";

import { useState } from "react";

import type { DocumentRegistryRecord } from "@/lib/storage/storage-types";

export default function StorageExplorer() {
  const [documents, setDocuments] = useState<DocumentRegistryRecord[]>([]);
  const [message, setMessage] = useState("");

  async function uploadDemoDocument() {
    setMessage("");

    const response = await fetch("/api/storage/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        category: "source",
        documentType: "xml",
        fileName: "pubmed-demo.xml",
        contentType: "application/xml",
        content:
          "<PubmedArticle><PMID>demo</PMID><ArticleTitle>Demo Literature Article</ArticleTitle></PubmedArticle>",
        module: "literature",
        sourceId: "pmid-demo",
        pmid: "demo",
        createdBy: "Article Fetch Agent",
        retentionPolicy: "retain",
        metadata: {
          source: "PubMed",
          purpose: "Sprint 26 demo upload",
        },
      }),
    });

    const json = await response.json();

    if (!json.success) {
      setMessage(json.message ?? "Upload failed.");
      return;
    }

    setDocuments((current) => [json.data, ...current]);
    setMessage("Document uploaded successfully.");
  }

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Enterprise Document Management
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Source PDFs, XML, HTML, OCR output, evidence packages, SOPs and audit
            attachments.
          </p>
        </div>

        <button
          className="rounded-md bg-indigo-600 px-4 py-2 text-white"
          onClick={uploadDemoDocument}
        >
          Upload Demo XML
        </button>
      </div>

      {message && (
        <div className="mb-5 rounded-md bg-emerald-50 p-3 text-sm">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Documents" value={documents.length} />
        <SummaryCard
          title="Total Size"
          value={`${documents.reduce((sum, item) => sum + item.sizeBytes, 0)} B`}
        />
        <SummaryCard title="Provider" value={documents[0]?.storageProvider ?? "-"} />
        <SummaryCard title="Bucket" value={documents[0]?.storageBucket ?? "-"} />
      </div>

      <div className="mt-6 space-y-3">
        {documents.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-gray-500">
            No documents uploaded in this session.
          </div>
        ) : (
          documents.map((document) => (
            <div key={document.id} className="rounded-lg border bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{document.fileName}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {document.category} • {document.documentType} • v
                    {document.version}
                  </div>
                </div>

                <span className="rounded-full bg-white px-3 py-1 text-xs">
                  {document.retentionPolicy}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs text-gray-600 md:grid-cols-3">
                <div>PMID: {document.pmid ?? "-"}</div>
                <div>DOI: {document.doi ?? "-"}</div>
                <div>Size: {document.sizeBytes} bytes</div>
                <div>Module: {document.module ?? "-"}</div>
                <div>Status: {document.status}</div>
                <div>Checksum: {document.checksum ?? "-"}</div>
              </div>

              <div className="mt-3 break-all rounded bg-white p-2 text-xs text-gray-500">
                {document.storageKey}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}