"use client";

import { useEffect, useState } from "react";

import type {
  DuplicateCheckResult,
  DuplicateStatus,
} from "@/lib/literature/duplicates/duplicate-types";

interface ApiResponse {
  status: DuplicateStatus;
  history: DuplicateCheckResult[];
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

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

export default function DuplicateDetectionPanel() {
  const [data, setData] =
    useState<ApiResponse | null>(null);

  async function loadHistory() {
    const response = await fetch(
      "/api/literature/duplicates",
      {
        cache: "no-store",
      },
    );

    const result =
      (await response.json()) as ApiResponse;

    setData(result);
  }

  async function runDemoCheck() {
    await fetch(
      "/api/literature/duplicates",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          tenantId: "demo-tenant",

          article: {
            id: `candidate-${Date.now()}`,

            articleId: `candidate-${Date.now()}`,

            pmid: "12345678",

            doi: "10.1000/demo",

            title:
              "Paracetamol induced liver injury",

            productName:
              "Paracetamol",

            source: "Demo",
          },

          existingArticles: [],
        }),
      },
    );

    await loadHistory();
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  const status = data?.status;

  const history =
    data?.history ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Duplicate Detection
          </h2>

          <p className="text-sm text-slate-500">
            Detect duplicate
            literature using PMID,
            DOI and title
            similarity.
          </p>
        </div>

        <button
          type="button"
          onClick={runDemoCheck}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Demo Check
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Checked Records"
          value={
            status?.checkedRecords ??
            0
          }
        />

        <MetricCard
          title="Duplicates Found"
          value={
            status?.duplicateRecords ??
            0
          }
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Duplicate Check
          History
        </div>

        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No duplicate
              checks executed.
            </div>
          ) : (
            history.map((item) => (
              <div
                key={`${item.candidate.id}-${item.checkedAt}`}
                className="space-y-3 p-4"
              >
                <div className="font-semibold">
                  {item.candidate.title}
                </div>

                <div className="text-sm text-slate-500">
                  PMID:{" "}
                  {item.candidate.pmid ??
                    "—"}{" "}
                  · DOI:{" "}
                  {item.candidate.doi ??
                    "—"}
                </div>

                <div
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    item.isDuplicate
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {item.isDuplicate
                    ? "Duplicate"
                    : "Unique"}
                </div>

                {item.matches.length >
                  0 && (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    {item.matches.map(
                      (match) => (
                        <div
                          key={
                            match.articleId
                          }
                        >
                          {
                            match.reason
                          }{" "}
                          · Score:{" "}
                          {match.confidence}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}