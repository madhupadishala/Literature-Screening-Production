"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type {
  ArticleFetchResponse,
  ArticleFetchStatus,
} from "@/lib/literature/article-fetch/article-fetch-types";

interface ApiResponse {
  status: ArticleFetchStatus;
  articles: ArticleFetchResponse[];
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

export default function ArticleFetchPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);

  async function loadArticles() {
    const response = await fetch("/api/literature/article-fetch", {
      cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse;

    setData(result);
  }

  async function fetchDemoArticle() {
    await fetch("/api/literature/article-fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        pmid: "00000001",
      }),
    });

    await loadArticles();
  }

  useDeferredLoad(loadArticles);

  const status = data?.status;
  const articles = data?.articles ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Article Fetch Agent
          </h2>

          <p className="text-sm text-slate-500">
            Retrieves literature metadata and prepares article evidence.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDemoArticle}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Fetch Demo Article
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <MetricCard
          title="Articles Fetched"
          value={status?.totalArticlesFetched ?? 0}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Article Fetch History
        </div>

        <div className="divide-y divide-slate-100">
          {articles.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No articles fetched.
            </div>
          ) : (
            articles.map((article) => (
              <div key={article.metadata.pmid} className="space-y-2 p-4">
                <div className="font-semibold text-slate-900">
                  {article.metadata.title}
                </div>

                <div className="text-sm text-slate-500">
                  PMID: {article.metadata.pmid} ·{" "}
                  {article.metadata.journal ?? "—"} ·{" "}
                  {article.metadata.publicationDate ?? "—"}
                </div>

                <div className="text-sm text-slate-600">
                  {article.metadata.abstract ?? "No abstract available."}
                </div>

                <div className="text-xs text-slate-500">
                  Full text available:{" "}
                  {article.metadata.fullTextAvailable ? "Yes" : "No"} ·
                  Fetched: {new Date(article.fetchedAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
