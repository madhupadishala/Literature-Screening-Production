"use client";

import { useEffect, useState } from "react";

interface ReadinessResponse {
  readiness: {
    score: number;
    productionReady: boolean;
    checks: {
      key: string;
      label: string;
      status: string;
      message: string;
    }[];
  };
}

export default function ProductionReadinessDashboard() {
  const [data, setData] =
    useState<ReadinessResponse | null>(
      null,
    );

  useEffect(() => {
    fetch("/api/system/readiness")
      .then((response) =>
        response.json(),
      )
      .then((json) =>
        setData(json),
      );
  }, []);

  if (!data) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading...
      </div>
    );
  }

  const readiness =
    data.readiness;

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-2xl font-semibold">
        Production Readiness
      </h2>

      <div className="mb-8 rounded-lg bg-slate-50 p-6">

        <div className="text-sm text-gray-500">
          Readiness Score
        </div>

        <div className="mt-2 text-5xl font-bold">
          {readiness.score}%
        </div>

        <div className="mt-3 text-lg font-semibold">

          {readiness.productionReady
            ? "Production Ready"
            : "Needs Attention"}

        </div>

      </div>

      <div className="space-y-3">

        {readiness.checks.map(
          (check) => (
            <div
              key={check.key}
              className="rounded-lg border p-4"
            >
              <div className="flex items-center justify-between">

                <strong>
                  {check.label}
                </strong>

                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                  {check.status}
                </span>

              </div>

              <div className="mt-2 text-sm text-gray-600">
                {check.message}
              </div>

            </div>
          ),
        )}

      </div>

    </div>
  );
}