"use client";

import {
  useEffect,
  useState,
} from "react";

interface DashboardData {
  totals: {
    hits: number;
    screening: number;
    intake: number;
    qc: number;
    serious: number;
    overrides: number;
  };

  ai: {
    averageConfidence: number;
    lowConfidenceCount: number;
  };

  sla: {
    totalTracked: number;
    breached: number;
    breachRate: number;
  };
}

export default function KPIDashboard() {
  const [dashboard, setDashboard] =
    useState<DashboardData | null>(
      null,
    );

  useEffect(() => {
    fetch(
      "/api/reporting/dashboard?tenantId=demo-tenant",
    )
      .then((response) =>
        response.json(),
      )
      .then((json) =>
        setDashboard(json.data),
      );
  }, []);

  if (!dashboard) {
    return (
      <div className="rounded-xl border bg-white p-6">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-6 text-2xl font-semibold">
        Enterprise KPI Dashboard
      </h2>

      <div className="grid gap-4 md:grid-cols-3">

        <Card
          title="Hits"
          value={dashboard.totals.hits}
        />

        <Card
          title="Screening"
          value={
            dashboard.totals.screening
          }
        />

        <Card
          title="Intake"
          value={
            dashboard.totals.intake
          }
        />

        <Card
          title="QC"
          value={dashboard.totals.qc}
        />

        <Card
          title="Serious"
          value={
            dashboard.totals.serious
          }
        />

        <Card
          title="Overrides"
          value={
            dashboard.totals.overrides
          }
        />

      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">

        <Card
          title="AI Confidence"
          value={`${(
            dashboard.ai
              .averageConfidence *
            100
          ).toFixed(1)}%`}
        />

        <Card
          title="Low Confidence"
          value={
            dashboard.ai
              .lowConfidenceCount
          }
        />

        <Card
          title="SLA Breach Rate"
          value={`${(
            dashboard.sla.breachRate *
            100
          ).toFixed(1)}%`}
        />

      </div>

    </div>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-5">

      <div className="text-sm text-gray-500">
        {title}
      </div>

      <div className="mt-2 text-3xl font-bold">
        {value}
      </div>

    </div>
  );
}