"use client";

import { useEffect, useState } from "react";

import type {
  KnowledgeGovernanceAuditEvent,
  KnowledgeGovernanceRecord,
  KnowledgeGovernanceStatus,
} from "@/lib/knowledge/governance/knowledge-governance-types";

interface ApiResponse {
  status: KnowledgeGovernanceStatus;
  records: KnowledgeGovernanceRecord[];
  auditEvents: KnowledgeGovernanceAuditEvent[];
}

function MetricCard({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default function KnowledgeGovernanceDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadData() {
    const response = await fetch("/api/knowledge/governance", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function createDemoRecord() {
    await fetch("/api/knowledge/governance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        knowledgeDocumentId: "demo-knowledge-id",
        version: "1.0",
        reviewer: "QA Manager",
        approver: "PV Head",
        trainingRequired: true,
      }),
    });

    await loadData();
  }

  useEffect(() => {
    void loadData();
  }, []);

  const status = data?.status;
  const records = data?.records ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Knowledge Governance
          </h2>

          <p className="text-sm text-slate-500">
            Approval workflow, version governance, effective dates and audit
            readiness.
          </p>
        </div>

        <button
          type="button"
          onClick={createDemoRecord}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Create Demo Record
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard
          title="Records"
          value={status?.totalRecords ?? 0}
        />
        <MetricCard
          title="In Review"
          value={status?.inReview ?? 0}
        />
        <MetricCard
          title="Approved"
          value={status?.approved ?? 0}
        />
        <MetricCard
          title="Effective"
          value={status?.effective ?? 0}
        />
        <MetricCard
          title="Training Required"
          value={status?.trainingRequired ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Governance Records
        </div>

        <div className="divide-y divide-slate-100">
          {records.length === 0 ? (
            <div className="p-6 text-slate-500">
              No governance records available.
            </div>
          ) : (
            records.map((record) => (
              <div key={record.id} className="space-y-2 p-4">
                <div className="font-semibold">
                  {record.knowledgeDocumentId}
                </div>

                <div className="text-sm text-slate-500">
                  Version {record.version}
                </div>

                <div className="text-sm text-slate-700">
                  Status: {record.status}
                </div>

                <div className="text-xs text-slate-500">
                  Reviewer: {record.reviewer ?? "—"} · Approver:{" "}
                  {record.approver ?? "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}