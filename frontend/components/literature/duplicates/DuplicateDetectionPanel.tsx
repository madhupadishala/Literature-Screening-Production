"use client";

import { useCallback, useEffect, useState } from "react";

interface DuplicateStatus {
  totalAssessments: number;
  uniqueRecords: number;
  duplicateRecords: number;
  possibleDuplicateRecords: number;
  mergedSourceRecords: number;
  lastAssessmentAt?: string;
}

interface DuplicateAssessment {
  id: string;
  candidateResultId: string;
  canonicalPackageId?: string;
  canonicalPackageKey?: string;
  sourceKey: string;
  sourceRecordId: string;
  title: string;
  classification: "unique" | "duplicate" | "possible_duplicate";
  confidence: number;
  matchSignals: string[];
  assessedBy: string;
  assessedAt: string;
}

interface DuplicateApiResponse {
  success: boolean;
  data?: {
    status: DuplicateStatus;
    assessments: DuplicateAssessment[];
  };
  error?: string;
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function confidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function DuplicateDetectionPanel() {
  const [data, setData] = useState<DuplicateApiResponse["data"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/literature/duplicates?limit=100", {
        cache: "no-store",
      });
      const payload = (await response.json()) as DuplicateApiResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Unable to load duplicate intelligence.");
      }

      setData(payload.data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load duplicate intelligence.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAssessments(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadAssessments]);

  const status = data?.status;
  const assessments = data?.assessments ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Duplicate Intelligence
          </h2>
          <p className="text-sm text-slate-500">
            Governed PMID, DOI, and canonical identity assessments across tenant literature.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAssessments()}
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Assessed" value={status?.totalAssessments ?? 0} />
        <MetricCard title="Duplicates" value={status?.duplicateRecords ?? 0} />
        <MetricCard title="Possible Duplicates" value={status?.possibleDuplicateRecords ?? 0} />
        <MetricCard title="Sources Merged" value={status?.mergedSourceRecords ?? 0} />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold">
          Persisted Assessments
        </div>
        <div className="divide-y divide-slate-100">
          {!loading && assessments.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No duplicate assessments have been persisted for this tenant.
            </div>
          ) : (
            assessments.map((assessment) => (
              <article key={assessment.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {assessment.title}
                    </div>
                    <div className="text-sm text-slate-500">
                      {assessment.sourceKey} · {assessment.sourceRecordId}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      assessment.classification === "duplicate"
                        ? "bg-red-100 text-red-700"
                        : assessment.classification === "possible_duplicate"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {assessment.classification.replaceAll("_", " ")} · {confidence(assessment.confidence)}
                  </span>
                </div>

                {assessment.canonicalPackageKey && (
                  <div className="text-sm text-slate-700">
                    Canonical workspace: <strong>{assessment.canonicalPackageKey}</strong>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {assessment.matchSignals.map((signal) => (
                    <span
                      key={signal}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {signal.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
