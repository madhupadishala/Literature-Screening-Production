"use client";

import styles from "./versioning.module.css";
import type { VersionStatus } from "@/lib/versioning/version-types";

type VersionBadgeProps = {
  versionLabel?: string | null;
  versionNumber?: number | null;
  status?: VersionStatus | string | null;
  compact?: boolean;
};

export default function VersionBadge({
  versionLabel,
  versionNumber,
  status = "LATEST",
  compact = false,
}: VersionBadgeProps) {
  const label = versionLabel ?? (versionNumber ? `v${versionNumber}` : "v1");
  const normalizedStatus = String(status ?? "LATEST").toLowerCase();

  return (
    <span
      className={`${styles.versionBadge} ${
        styles[normalizedStatus] ?? styles.latest
      } ${compact ? styles.compact : ""}`}
      title={`Version ${label} · ${status ?? "LATEST"}`}
    >
      {compact ? label : `${label} · ${status ?? "LATEST"}`}
    </span>
  );
}