"use client";

interface PerformanceMetricsProps {
  metrics: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDurationMs: number;
    fastestDurationMs: number;
    slowestDurationMs: number;
  };
}

export default function PerformanceMetrics({
  metrics,
}: PerformanceMetricsProps) {
  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-5 text-xl font-semibold">
        Performance Metrics
      </h2>

      <div className="grid gap-4 md:grid-cols-3">

        <Card
          title="Executions"
          value={metrics.totalExecutions}
        />

        <Card
          title="Success"
          value={metrics.successfulExecutions}
        />

        <Card
          title="Failures"
          value={metrics.failedExecutions}
        />

        <Card
          title="Average"
          value={`${metrics.averageDurationMs.toFixed(
            1,
          )} ms`}
        />

        <Card
          title="Fastest"
          value={`${metrics.fastestDurationMs} ms`}
        />

        <Card
          title="Slowest"
          value={`${metrics.slowestDurationMs} ms`}
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
    <div className="rounded-lg bg-slate-50 p-4">

      <div className="text-sm text-gray-500">
        {title}
      </div>

      <div className="mt-2 text-2xl font-bold">
        {value}
      </div>

    </div>
  );
}