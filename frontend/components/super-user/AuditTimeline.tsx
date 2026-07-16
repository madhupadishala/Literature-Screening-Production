import styles from "./super-user.module.css";
import type { AuditEntry } from "@/lib/super-user/history-store";

type AuditTimelineProps = {
  entries: AuditEntry[];
};

export default function AuditTimeline({ entries }: AuditTimelineProps) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>
        <h3>Audit Timeline</h3>
        <span>{sortedEntries.length}</span>
      </div>

      <div className={styles.timeline}>
        {sortedEntries.map((entry) => (
          <article key={entry.id} className={styles.timelineItem}>
            <div className={styles.timelineDot} />

            <div className={styles.timelineCard}>
              <div className={styles.timelineTop}>
                <strong>{entry.title}</strong>
                <span>{formatDate(entry.timestamp)}</span>
              </div>

              <p>{entry.description}</p>

              <div className={styles.timelineMeta}>
                <span>{entry.actor}</span>
                <span>{entry.action}</span>
              </div>

              {entry.metadata ? (
                <div className={styles.metadataGrid}>
                  {Object.entries(entry.metadata).map(([key, value]) => (
                    <div key={key}>
                      <span>{key}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}