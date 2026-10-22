import styles from "./OperationalMetricStrip.module.css";

type Metric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "attention" | "positive" | "critical";
};

export default function OperationalMetricStrip({ metrics, compact = false }: { metrics: Metric[]; compact?: boolean }) {
  return (
    <section className={[styles.metricStrip, compact ? styles.compact : ""].filter(Boolean).join(" ")} aria-label="Operational summary">
      {metrics.map((metric) => {
        const toneClass =
          metric.tone && metric.tone !== "neutral" ? styles[metric.tone] : "";
        return (
          <div
            className={[styles.metric, toneClass].filter(Boolean).join(" ")}
            key={metric.label}
          >
            <span className={styles.label}>{metric.label}</span>
            <strong className={styles.value}>{metric.value}</strong>
          </div>
        );
      })}
    </section>
  );
}
