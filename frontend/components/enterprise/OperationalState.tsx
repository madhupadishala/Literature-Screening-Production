import type { ReactNode } from "react";

import styles from "./OperationalState.module.css";

type OperationalStateProps = {
  kind: "loading" | "empty" | "error" | "read-only" | "info";
  title: string;
  message: string;
  actions?: ReactNode;
  compact?: boolean;
};

export default function OperationalState({
  kind,
  title,
  message,
  actions,
  compact = false,
}: OperationalStateProps) {
  return (
    <section
      className={[
        styles.state,
        styles[kind === "read-only" ? "readOnly" : kind],
        compact ? styles.compact : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <div className={styles.indicator} aria-hidden="true" />
      <div className={styles.copy}>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
