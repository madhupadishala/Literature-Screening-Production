"use client";

import type { AuditRecord } from "@/lib/audit/audit-types";

import styles from "./audit.module.css";

export default function AuditResultTable({
  records,
  total,
  page,
  pageSize,
  loading,
  onExport,
  onPageChange,
}: {
  records: AuditRecord[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onExport: () => void;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className={styles.resultPanel}>
      <div className={styles.resultHeader}>
        <div>
          <p>Tenant-scoped results</p>
          <h2>{total} event(s)</h2>
        </div>
        <button type="button" disabled={loading || total === 0} onClick={onExport}>
          Export Filtered CSV
        </button>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Category / Event</th>
              <th>Outcome</th>
              <th>Package</th>
              <th>Actor</th>
              <th>Trace</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  {loading ? "Loading audit ledger…" : "No audit events match the filters."}
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{formatDate(record.performedAt)}</strong>
                    <span>{record.id}</span>
                  </td>
                  <td>
                    <strong>{record.eventCategory}</strong>
                    <span>{record.eventType}</span>
                  </td>
                  <td>
                    <span
                      className={
                        record.severity === "CRITICAL"
                          ? styles.severityCritical
                          : record.severity === "WARNING"
                            ? styles.severityWarning
                            : styles.severityInfo
                      }
                    >
                      {record.outcome}
                    </span>
                  </td>
                  <td>
                    <strong>{record.packageKey || "—"}</strong>
                    <span>{record.packageId || "No package"}</span>
                  </td>
                  <td>
                    <strong>{record.performedBy.name}</strong>
                    <span>{record.performedBy.role}</span>
                  </td>
                  <td>
                    <strong>{record.correlationId || "—"}</strong>
                    <span>{record.requestId || record.ipAddress || "No request trace"}</span>
                  </td>
                  <td>
                    <span>{detailSummary(record.details)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium" }).format(
    new Date(value),
  );
}

function detailSummary(details: Record<string, unknown>): string {
  const entries = Object.entries(details).slice(0, 4);
  if (!entries.length) return "No additional details";
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ");
}
