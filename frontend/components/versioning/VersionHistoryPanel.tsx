"use client";

import { useEffect, useState } from "react";
import VersionBadge from "./VersionBadge";
import styles from "./versioning.module.css";
import type { VersionHistory } from "@/lib/versioning/version-types";

type VersionHistoryPanelProps = {
  packageId: string;
};

type VersionApiResponse = {
  ok: boolean;
  generatedAt: string;
  data: VersionHistory;
};

export default function VersionHistoryPanel({
  packageId,
}: VersionHistoryPanelProps) {
  const [history, setHistory] = useState<VersionHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVersionHistory() {
      try {
        const response = await fetch(
          `/api/versioning/package?packageId=${encodeURIComponent(packageId)}`,
          { cache: "no-store" },
        );

        const data: VersionApiResponse = await response.json();

        if (data.ok) {
          setHistory(data.data);
        }
      } finally {
        setLoading(false);
      }
    }

    loadVersionHistory();
  }, [packageId]);

  if (loading) {
    return (
      <section className={styles.versionPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p>Version Management</p>
            <h2>Loading version history...</h2>
          </div>
        </div>
      </section>
    );
  }

  if (!history || history.versions.length === 0) {
    return (
      <section className={styles.versionPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p>Version Management</p>
            <h2>No version history found</h2>
            <span>{packageId}</span>
          </div>
        </div>

        <div className={styles.emptyState}>
          No package versions are available for this package.
        </div>
      </section>
    );
  }

  return (
    <section className={styles.versionPanel}>
      <div className={styles.panelHeader}>
        <div>
          <p>Version Management</p>
          <h2>Package Version History</h2>
          <span>
            {history.packageId} · {history.totalVersions} version(s)
          </span>
        </div>

        {history.latestVersion ? (
          <VersionBadge
            versionLabel={history.latestVersion.versionLabel}
            status={history.latestVersion.status}
          />
        ) : null}
      </div>

      <div className={styles.versionList}>
        {history.versions.map((version) => (
          <article key={version.id} className={styles.versionItem}>
            <div className={styles.versionMeta}>
              <VersionBadge
                versionLabel={version.versionLabel}
                status={version.status}
                compact
              />
              <small>{formatDate(version.createdAt)}</small>
            </div>

            <div className={styles.versionBody}>
              <h3>{version.trigger.replaceAll("_", " ")}</h3>
              <p>{version.reason}</p>

              <div className={styles.versionFacts}>
                <span>Stage: {version.workflowStage}</span>
                <span>By: {version.createdBy.name}</span>
                <span>Role: {version.createdBy.role}</span>
                {version.sourceVersionId ? (
                  <span>Source: {version.sourceVersionId}</span>
                ) : null}
              </div>

              {version.changes.length > 0 ? (
                <div className={styles.changeList}>
                  {version.changes.map((change, index) => (
                    <div
                      key={`${version.id}-${change.field}-${index}`}
                      className={styles.changeItem}
                    >
                      <strong>{change.field}</strong>
                      <span>
                        {formatChangeValue(change.previousValue)} →{" "}
                        {formatChangeValue(change.newValue)}
                      </span>
                      {change.reason ? <p>{change.reason}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p>No field-level changes recorded.</p>
              )}
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

function formatChangeValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}