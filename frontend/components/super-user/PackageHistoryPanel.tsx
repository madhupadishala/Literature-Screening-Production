"use client";

import { useEffect, useState } from "react";
import AuditTimeline from "./AuditTimeline";
import styles from "./super-user.module.css";
import type { PackageHistory } from "@/lib/super-user/history-store";

type PackageHistoryPanelProps = {
  packageId?: string;
};

type PackageHistoryResponse = {
  ok: boolean;
  generatedAt: string;
  data: PackageHistory;
};

export default function PackageHistoryPanel({
  packageId = "PKG-LIT-2026-0001",
}: PackageHistoryPanelProps) {
  const [history, setHistory] = useState<PackageHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/super-user/packages/history?packageId=${encodeURIComponent(
            packageId,
          )}`,
          { cache: "no-store" },
        );

        const data: PackageHistoryResponse = await response.json();

        if (data.ok) {
          setHistory(data.data);
        }
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [packageId]);

  if (loading) {
    return (
      <aside className={styles.historyPanel}>
        <div className={styles.panelHeader}>
          <p>Package History</p>
          <h2>Loading...</h2>
        </div>
      </aside>
    );
  }

  if (!history) {
    return (
      <aside className={styles.historyPanel}>
        <div className={styles.panelHeader}>
          <p>Package History</p>
          <h2>No history found</h2>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.historyPanel}>
      <div className={styles.panelHeader}>
        <p>Package History</p>
        <h2>{history.packageName}</h2>
        <span>{history.packageId}</span>
      </div>

      <div className={styles.statusGrid}>
        <div>
          <span>Current Stage</span>
          <strong>{history.currentStage}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{history.currentStatus}</strong>
        </div>
        <div>
          <span>Created By</span>
          <strong>{history.createdBy}</strong>
        </div>
        <div>
          <span>Created At</span>
          <strong>{formatDate(history.createdAt)}</strong>
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h3>Workflow Transitions</h3>
          <span>{history.workflowTransitions.length}</span>
        </div>

        <div className={styles.transitionList}>
          {history.workflowTransitions.map((transition) => (
            <div key={transition.id} className={styles.transitionItem}>
              <strong>
                {transition.fromStage} → {transition.toStage}
              </strong>
              <span>
                {transition.performedBy} · {formatDate(transition.performedAt)}
              </span>
              {transition.reason ? <p>{transition.reason}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h3>Mandatory Comments</h3>
          <span>{history.comments.length}</span>
        </div>

        <div className={styles.commentList}>
          {history.comments.map((comment) => (
            <div key={comment.id} className={styles.commentItem}>
              <div>
                <strong>{comment.type}</strong>
                <span>{formatDate(comment.createdAt)}</span>
              </div>
              <p>{comment.comment}</p>
              <small>{comment.createdBy}</small>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h3>Unlock History</h3>
          <span>{history.unlockRecords.length}</span>
        </div>

        <div className={styles.unlockList}>
          {history.unlockRecords.map((record) => (
            <div key={record.id} className={styles.unlockItem}>
              <strong>{record.reason}</strong>
              <span>
                {record.previousStatus} → {record.newStatus}
              </span>
              <small>
                {record.unlockedBy} · {formatDate(record.unlockedAt)}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h3>Version History</h3>
          <span>{history.versionHistory.length}</span>
        </div>

        <div className={styles.versionList}>
          {history.versionHistory.map((version) => (
            <div key={version.id} className={styles.versionItem}>
              <strong>{version.version}</strong>
              <p>{version.summary}</p>
              <small>
                {version.createdBy} · {formatDate(version.createdAt)}
              </small>
            </div>
          ))}
        </div>
      </section>

      <AuditTimeline entries={history.auditEntries} />
    </aside>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}