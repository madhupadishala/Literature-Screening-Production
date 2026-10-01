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
          border: 1px solid #d6d9de;
          border-top: 0;
          background: #ffffff;
        }
        .metric {
          min-width: 0;
          padding: 10px 12px;
          border-right: 1px solid #e0e0e0;
        }
        .metric:last-child { border-right: 0; }
        span {
          display: block;
          margin-bottom: 2px;
          color: #6f6f6f;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .04em;
          text-transform: uppercase;
        }
        strong {
          color: #161616;
          font-size: 19px;
          font-weight: 600;
          line-height: 1.2;
        }
        .metric-attention strong { color: #8a3b12; }
        .metric-positive strong { color: #198038; }
        .metric-critical strong { color: #da1e28; }
        @media (max-width: 700px) {
          .metric-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .metric { border-bottom: 1px solid #e0e0e0; }
        }
      `}</style>
    </section>
  );
}
