"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  PubMedSearchResponse,
  PubMedStatus,
} from "@/lib/literature/pubmed/pubmed-types";

interface ApiResponse {
  status: PubMedStatus;
  searches: PubMedSearchResponse[];
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

export default function PubMedSearchPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadSearches() {
    const response = await fetch("/api/literature/pubmed/search", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function runDemoSearch() {
    await fetch("/api/literature/pubmed/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        query:
          "(Paracetamol OR Acetaminophen OR Tylenol) AND (adverse event OR toxicity OR safety)",
        maxResults: 10,
      }),
    });

    await loadSearches();
  }

  useDeferredLoad(loadSearches);

  const status = data?.status;
  const searches = data?.searches ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            PubMed Connector
          </h2>

          <p className="text-sm text-slate-500">
            Literature source connector for PubMed search execution.
          </p>
        </div>

        <button
          type="button"
          onClick={runDemoSearch}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Run Demo Search
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Provider" value={status?.provider ?? "PubMed"} />
        <MetricCard title="Total Searches" value={status?.totalSearches ?? 0} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Search History
        </div>

        <div className="divide-y divide-slate-100">
          {searches.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No PubMed searches executed.
            </div>
          ) : (
            searches.map((search, index) => (
              <div key={`${search.query}-${index}`} className="space-y-3 p-4">
                <div className="rounded bg-slate-50 p-3 font-mono text-sm break-all">
                  {search.query}
                </div>

                <div className="text-sm text-slate-500">
                  Results: {search.totalResults} · Searched:{" "}
                  {new Date(search.searchedAt).toLocaleString()}
                </div>

                <div className="space-y-2">
                  {search.articles.map((article) => (
                    <div
                      key={article.pmid}
                      className="rounded-lg border border-slate-200 p-3"
                    >
                      <div className="font-semibold text-slate-900">
                        {article.title}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        PMID: {article.pmid} · {article.journal ?? "—"} ·{" "}
                        {article.publicationDate ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
