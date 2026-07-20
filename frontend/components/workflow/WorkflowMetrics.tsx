type WorkflowMetricsProps = {
  total: number;
  completed: number;
  pending: number;
  running: number;
  hits: number;
  screening: number;
  output: number;
};

type Tone = "neutral" | "primary" | "success" | "warning" | "cyan";

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: Tone;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function WorkflowMetrics({
  total,
  completed,
  pending,
  running,
  hits,
  screening,
  output,
}: WorkflowMetricsProps) {
  return (
    <section className="metrics" aria-label="Workflow metrics">
      <MetricCard label="Evidence Packages" value={total} />
      <MetricCard label="Completed" value={completed} tone="success" />
      <MetricCard label="Pending Review" value={pending} tone="warning" />
      <MetricCard label="Running" value={running} tone="primary" />
      <MetricCard label="Hits Identified" value={hits} tone="cyan" />
      <MetricCard label="Screening Results" value={screening} tone="primary" />
      <MetricCard label="Downstream Outputs" value={output} tone="success" />

      <style jsx>{`
        .metrics {
          display: grid;
          grid-template-columns: repeat(7, minmax(135px, 1fr));
          gap: 12px;
          margin: 0 0 18px;
        }

        .metric-card {
          position: relative;
          overflow: hidden;
          min-height: 104px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 17px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
        }

        .metric-card::after {
          content: "";
          position: absolute;
          right: -26px;
          bottom: -35px;
          width: 82px;
          height: 82px;
          border-radius: 999px;
          background: #f1f5f9;
        }

        .metric-card span {
          position: relative;
          z-index: 1;
          display: block;
          min-height: 32px;
          color: #64748b;
          font-size: 11px;
          line-height: 1.35;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.045em;
        }

        .metric-card strong {
          position: relative;
          z-index: 1;
          display: block;
          margin-top: 8px;
          color: #0f172a;
          font-size: 27px;
          line-height: 1;
        }

        .metric-card.primary {
          border-color: #bfdbfe;
          background: #f8fbff;
        }

        .metric-card.primary::after {
          background: #dbeafe;
        }

        .metric-card.success {
          border-color: #bbf7d0;
          background: #f7fff9;
        }

        .metric-card.success::after {
          background: #dcfce7;
        }

        .metric-card.warning {
          border-color: #fde68a;
          background: #fffdf5;
        }

        .metric-card.warning::after {
          background: #fef3c7;
        }

        .metric-card.cyan {
          border-color: #bae6fd;
          background: #f5fcff;
        }

        .metric-card.cyan::after {
          background: #e0f2fe;
        }

        @media (max-width: 1380px) {
          .metrics {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        @media (max-width: 820px) {
          .metrics {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .metrics {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
