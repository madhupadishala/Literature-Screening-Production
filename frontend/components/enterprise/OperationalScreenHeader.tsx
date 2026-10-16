import type { ReactNode } from "react";

import styles from "./OperationalScreenHeader.module.css";

type OperationalScreenHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  actions?: ReactNode;
  compact?: boolean;
};

export default function OperationalScreenHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  compact = false,
}: OperationalScreenHeaderProps) {
  return (
    <section className={[styles.screenHeader, compact ? styles.compact : ""].filter(Boolean).join(" ")} aria-labelledby="ops-screen-title">
      <div className={styles.screenCopy}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <div className={styles.titleRow}>
          <h1 id="ops-screen-title" className={styles.title}>
            {title}
          </h1>
          {status ? <span className={styles.status}>{status}</span> : null}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
