"use client";

interface WorkflowAnalyticsProps {
  dashboard: {
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
  };
}

export default function WorkflowAnalytics({
  dashboard,
}: WorkflowAnalyticsProps) {
  return (
    <div className="rounded-xl border bg-white p-6">

      <h2 className="mb-5 text-xl font-semibold">
        Workflow Analytics
      </h2>

      <table className="w-full border-collapse">

        <thead>

          <tr className="border-b">

            <th className="py-2 text-left">
              Metric
            </th>

            <th className="py-2 text-right">
              Value
            </th>

          </tr>

        </thead>

        <tbody>

          <Row
            title="Hits Processed"
            value={
              dashboard.totals.hits
            }
          />

          <Row
            title="Screening Completed"
            value={
              dashboard.totals
                .screening
            }
          />

          <Row
            title="Intake Completed"
            value={
              dashboard.totals.intake
            }
          />

          <Row
            title="QC Completed"
            value={
              dashboard.totals.qc
            }
          />

          <Row
            title="Serious Cases"
            value={
              dashboard.totals.serious
            }
          />

          <Row
            title="Manual Overrides"
            value={
              dashboard.totals
                .overrides
            }
          />

          <Row
            title="Average AI Confidence"
            value={`${(
              dashboard.ai
                .averageConfidence *
              100
            ).toFixed(1)}%`}
          />

          <Row
            title="Low Confidence"
            value={
              dashboard.ai
                .lowConfidenceCount
            }
          />

          <Row
            title="SLA Breach"
            value={`${(
              dashboard.sla
                .breachRate *
              100
            ).toFixed(1)}%`}
          />

        </tbody>

      </table>

    </div>
  );
}

function Row({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <tr className="border-b">

      <td className="py-3">
        {title}
      </td>

      <td className="py-3 text-right font-semibold">
        {value}
      </td>

    </tr>
  );
}