"use client";

import { useState } from "react";

export default function ImportExportPanel() {
  const [tenantId] = useState("demo-tenant");
  const [statusMessage, setStatusMessage] = useState("");

  async function createImportJob() {
    const response = await fetch("/api/io/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId,
        sourceType: "csv",
        fileName: "literature.csv",
        totalRecords: 250,
      }),
    });

    const json = await response.json();

    setStatusMessage(
      `Import Job Created: ${json.data.id}`,
    );
  }

  async function createExportJob() {
    const response = await fetch("/api/io/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId,
        scope: "screening",
        format: "json",
        totalRecords: 125,
      }),
    });

    const json = await response.json();

    setStatusMessage(
      `Export Job Created: ${json.data.id}`,
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-2 text-2xl font-semibold">
        Enterprise Data Exchange
      </h2>

      <p className="mb-6 text-sm text-gray-500">
        Unified import/export framework for literature,
        evidence, workflow, reports and future external systems.
      </p>

      <div className="grid gap-6 md:grid-cols-2">

        <div className="rounded-lg border bg-slate-50 p-5">

          <h3 className="text-lg font-semibold">
            Import Queue
          </h3>

          <p className="mt-2 text-sm text-gray-600">
            Supported:
          </p>

          <ul className="mt-3 list-disc pl-5 text-sm">
            <li>CSV</li>
            <li>Excel</li>
            <li>JSON</li>
            <li>PDF</li>
            <li>ZIP</li>
            <li>REST API (future)</li>
            <li>SFTP (future)</li>
          </ul>

          <button
            onClick={createImportJob}
            className="mt-5 rounded-md bg-indigo-600 px-4 py-2 text-white"
          >
            Create Import Job
          </button>

        </div>

        <div className="rounded-lg border bg-slate-50 p-5">

          <h3 className="text-lg font-semibold">
            Export Queue
          </h3>

          <p className="mt-2 text-sm text-gray-600">
            Supported:
          </p>

          <ul className="mt-3 list-disc pl-5 text-sm">
            <li>JSON</li>
            <li>CSV</li>
            <li>Excel</li>
            <li>PDF</li>
            <li>ZIP</li>
            <li>Evidence Package</li>
          </ul>

          <button
            onClick={createExportJob}
            className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-white"
          >
            Create Export Job
          </button>

        </div>

      </div>

      {statusMessage && (
        <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm">
          {statusMessage}
        </div>
      )}

      <div className="mt-8 rounded-lg border bg-slate-50 p-5">

        <h3 className="text-lg font-semibold">
          Future Enterprise Connectors
        </h3>

        <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">

          <div>Oracle Argus</div>
          <div>Veeva Vault</div>
          <div>ArisGlobal</div>
          <div>Azure Blob</div>
          <div>AWS S3</div>
          <div>SFTP</div>
          <div>FHIR</div>
          <div>REST APIs</div>
          <div>Power BI</div>

        </div>

      </div>

    </div>
  );
}