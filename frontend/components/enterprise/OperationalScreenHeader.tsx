import type { ReactNode } from "react";

import styles from "./OperationalScreenHeader.module.css";

type OperationalScreenHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  actions?: ReactNode;
};

export default function OperationalScreenHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}: OperationalScreenHeaderProps) {
  return (
    <section className={styles.screenHeader} aria-labelledby="ops-screen-title">
      <div className={styles.screenCopy}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <div className={styles.titleRow}>
          <h1 id="ops-screen-title" className={styles.title}>
            {title}
          </h1>
          {status ? <span className={styles.status}>{status}</span> : null}
        </div>
        <p className={styles.description}>{description}</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
