type Metric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "attention" | "positive" | "critical";
};

export default function OperationalMetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metric-strip" aria-label="Operational summary">
      {metrics.map((metric) => (
        <div className={`metric metric-${metric.tone ?? "neutral"}`} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
      <style jsx>{`
        .metric-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          border: 1px solid var(--nx-color-border);
          border-top: 0;
          background: var(--nx-color-surface);
        }
        .metric {
          min-width: 0;
          padding: 10px 12px;
          border-right: 1px solid var(--nx-color-surface-muted);
        }
        .metric:last-child { border-right: 0; }
        span {
          display: block;
          margin-bottom: 2px;
          color: var(--nx-color-text-muted);
          font-size: var(--nx-font-size-1);
          font-weight: 600;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        strong {
          color: var(--nx-color-text);
          font-size: var(--nx-font-size-6);
          font-weight: 600;
          line-height: 1.2;
        }
        .metric-attention strong { color: var(--nx-color-warning); }
        .metric-positive strong { color: var(--nx-color-positive); }
        .metric-critical strong { color: var(--nx-color-critical); }
        @media (max-width: 700px) {
          .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .metric { border-bottom: 1px solid var(--nx-color-surface-muted); }
        }
      `}</style>
    </section>
  );
}
