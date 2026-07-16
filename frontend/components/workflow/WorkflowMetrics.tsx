type WorkflowMetricsProps = {
  total: number;
  completed: number;
  pending: number;
  hits: number;
  screening: number;
  intake: number;
  running: number;
};

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "active";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function WorkflowMetrics({
  total,
  completed,
  pending,
  hits,
  screening,
  intake,
  running,
}: WorkflowMetricsProps) {
  return (
    <section className="metrics-grid">
      <MetricCard label="Total Packages" value={total} />
      <MetricCard label="Completed" value={completed} tone="success" />
      <MetricCard label="Pending" value={pending} tone="warning" />
      <MetricCard label="Running" value={running} tone="active" />
      <MetricCard label="Hits Generated" value={hits} />
      <MetricCard label="Screening Records" value={screening} />
      <MetricCard label="Intake Packages" value={intake} tone="success" />

      <style jsx>{`
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 14px;
          margin-bottom: 18px;
        }

        .metric-card {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          min-height: 92px;
        }

        .metric-card span {
          display: block;
          color: #64748b;
          font-size: 12px;
          margin-bottom: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .metric-card strong {
          font-size: 28px;
          color: #0f172a;
        }

        .metric-card.success strong {
          color: #15803d;
        }

        .metric-card.warning strong {
          color: #b45309;
        }

        .metric-card.active strong {
          color: #185a9d;
        }

        @media (max-width: 1300px) {
          .metrics-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        @media (max-width: 900px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}