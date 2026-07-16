"use client";

import styles from "./workflow.module.css";

type Props = {
  status?: string;
  stage?: string;
};

export default function WorkflowStatusBadge({ status, stage }: Props) {
  const value = status || stage || "NEW";
  const className = value.toLowerCase().replaceAll("_", "-");

  return (
    <span className={`${styles.badge} ${styles[className] ?? ""}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}