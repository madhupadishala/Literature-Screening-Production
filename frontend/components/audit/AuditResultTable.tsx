"use client";

import styles from "./audit.module.css";
import type { AuditRecord } from "@/lib/audit/audit-types";

type AuditResultTableProps = {
  records: AuditRecord[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export default function AuditResultTable({
  records,
  total,
  page,
  pageSize,
  onPageChange,
}: AuditResultTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className={styles.resultPanel}>
      <div className={styles.resultHeader}>
        <div>
          <p>Audit Results</p>
          <h2>{total} record(s)</h2>
        </div>

        <button>Export Ready</button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.auditTable}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Module</th>
              <th>Entity</th>
              <th>Package</th>
              <th>Action</th>
              <th>Severity</th>
              <th>User</th>
              <th>Description</th>
              <th>Change</th>
            </tr>
          </thead>

          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  No audit records found.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.performedAt)}</td>
                  <td>{record.module}</td>
                  <td>
                    <strong>{record.entityType}</strong>
                    <span>{record.entityId}</span>
                  </td>
                  <td>{record.packageId ?? "—"}</td>
                  <td>
                    <span className={styles.actionBadge}>{record.action}</span>
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
                      {record.severity}
                    </span>
                  </td>
                  <td>
                    <strong>{record.performedBy.name}</strong>
                    <span>{record.performedBy.role}</span>
                  </td>
                  <td>
                    <strong>{record.title}</strong>
                    <span>{record.description}</span>
                  </td>
                  <td>
                    {record.previousValue || record.newValue ? (
                      <span>
                        {record.previousValue ?? "—"} → {record.newValue ?? "—"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </button>

        <span>
          Page {page} of {totalPages}
        </span>

        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next
        </button>
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