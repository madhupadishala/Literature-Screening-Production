"use client";

import type { EvidencePackage } from "@/lib/evidence/evidence-types";

interface EvidenceDownloadPanelProps {
  evidencePackage: EvidencePackage;
}

export default function EvidenceDownloadPanel({
  evidencePackage,
}: EvidenceDownloadPanelProps) {
  function downloadJson() {
    const fileContent = JSON.stringify(evidencePackage, null, 2);
    const blob = new Blob([fileContent], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${evidencePackage.metadata.packageId}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">
        Evidence Download
      </h2>

      <p className="mb-5 text-sm text-gray-600">
        Export the current Evidence Package as a structured JSON artifact.
        PDF and ZIP export can be added in the production hardening phase.
      </p>

      <div className="rounded-lg bg-slate-50 p-4 text-sm">
        <div>
          <strong>Package:</strong>{" "}
          {evidencePackage.metadata.packageId}
        </div>

        <div className="mt-2">
          <strong>Hash:</strong>{" "}
          {evidencePackage.metadata.packageHash}
        </div>

        <div className="mt-2">
          <strong>Status:</strong>{" "}
          {evidencePackage.metadata.status}
        </div>
      </div>

      <button
        className="mt-5 rounded-md bg-indigo-600 px-5 py-2 text-white"
        onClick={downloadJson}
      >
        Download JSON Package
      </button>
    </div>
  );
}