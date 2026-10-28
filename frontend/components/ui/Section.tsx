import type { ReactNode } from "react";
import styles from "./primitives.module.css";

type SectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function Section({ title, children, defaultOpen = true }: SectionProps) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary className={styles.sectionSummary}>{title}</summary>
      <div className={styles.sectionBody}>{children}</div>
    </details>
  );
}

export default Section;
