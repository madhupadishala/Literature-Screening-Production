"use client";

import type { SearchResponse } from "@/lib/search/search-types";

interface SearchResultsProps {
  response: SearchResponse | null;
}

export default function SearchResults({
  response,
}: SearchResultsProps) {
  if (!response) {
    return null;
  }

  return (
    <div className="mt-6 rounded-xl border bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Search Results</h2>
          <p className="mt-1 text-sm text-gray-500">
            {response.totalResults} result(s) for &ldquo;{response.query}&rdquo;
          </p>
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
          {response.mode}
        </span>
      </div>

      <div className="space-y-4">
        {response.results.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-gray-500">
            No matching enterprise records found.
          </div>
        ) : (
          response.results.map((result) => (
            <div
              key={result.record.id}
              className="rounded-lg border bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    {result.record.type} • {result.record.sourceModule}
                  </div>

                  <h3 className="mt-1 font-semibold">
                    {result.record.title}
                  </h3>

                  <p className="mt-2 text-sm text-gray-700">
                    {result.record.summary}
                  </p>
                </div>

                <div className="text-right text-xs text-gray-500">
                  <div>Score</div>
                  <div className="mt-1 font-semibold">
                    {result.score.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {result.record.productName && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs">
                    {result.record.productName}
                  </span>
                )}

                {result.record.country && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs">
                    {result.record.country}
                  </span>
                )}

                {result.record.workflowStage && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs">
                    {result.record.workflowStage}
                  </span>
                )}

                {result.record.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white px-3 py-1 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                {result.explanation}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
