"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type { JobRecord, JobSummary } from "@/lib/jobs/job-types";

interface JobStatusResponse {
  summary: JobSummary;
  jobs: JobRecord[];
  generatedAt: string;
}

export default function JobDashboard() {
  const [data, setData] = useState<JobStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadJobs() {
    const response = await fetch("/api/jobs/status?tenantId=demo-tenant");
    const json = await response.json();

    setData(json.data);
    setLoading(false);
  }

  async function runJobs() {
    const response = await fetch("/api/jobs/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenantId: "demo-tenant",
        limit: 5,
      }),
    });

    const json = await response.json();

    setData(json.data);
  }

  useDeferredLoad(loadJobs);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading jobs...
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">
            Enterprise Processing Engine
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Background processing for article fetch, OCR, embeddings, AI,
            evidence packages and exports.
          </p>
        </div>

        <button
          className="rounded-md bg-indigo-600 px-4 py-2 text-white"
          onClick={runJobs}
        >
          Run Queued Jobs
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <SummaryCard title="Total" value={data.summary.total} />
        <SummaryCard title="Queued" value={data.summary.queued} />
        <SummaryCard title="Running" value={data.summary.processing} />
        <SummaryCard title="Done" value={data.summary.completed} />
        <SummaryCard title="Failed" value={data.summary.failed} />
        <SummaryCard title="Cancelled" value={data.summary.cancelled} />
      </div>

      <div className="mt-6 space-y-3">
        {data.jobs.map((job) => (
          <div key={job.id} className="rounded-lg border bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold">{job.type}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {job.id} • {job.priority} priority
                </div>
              </div>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">
                {job.status}
              </span>
            </div>

            <div className="mt-4 h-2 rounded-full bg-white">
              <div
                className="h-2 rounded-full bg-indigo-600"
                style={{
                  width: `${job.progress}%`,
                }}
              />
            </div>

            <div className="mt-3 grid gap-2 text-xs text-gray-600 md:grid-cols-4">
              <div>Attempts: {job.attempts}/{job.maxAttempts}</div>
              <div>Progress: {job.progress}%</div>
              <div>Created By: {job.createdBy ?? "-"}</div>
              <div>Updated: {new Date(job.updatedAt).toLocaleString()}</div>
            </div>

            {job.error && (
              <div className="mt-3 rounded bg-red-50 p-3 text-xs text-red-700">
                {job.error}
              </div>
            )}
          </div>
        ))}
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
