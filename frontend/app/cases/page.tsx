"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./cases.module.css";

type CaseRow = {
  caseId: string;
  caseKey: string;
  intakeRecordId: string;
  caseStatus: string;
  priority: string;
  seriousnessStatus: string;
  assignedTo: string | null;
  currentDraftRevision: number;
  currentVersion: number;
  initialReceiptDate: string;
  latestReceiptDate: string;
  updatedAt: string;
};

function statusTone(status: string): string {
  if (["FINAL", "FINALIZED", "QC_APPROVED"].includes(status)) return styles.good;
  if (["QC_RETURNED"].includes(status)) return styles.bad;
  if (["READY_FOR_QC", "MEDICAL_REVIEW"].includes(status)) return styles.review;
  return styles.neutral;
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export default function CasesPage() {
  const [records, setRecords] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/safety/cases?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load case worklist.");
      }
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load cases.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((item) =>
      [
        item.caseKey,
        item.intakeRecordId,
        item.caseStatus,
        item.priority,
        item.seriousnessStatus,
        item.assignedTo || "unassigned",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  const processing = records.filter((r) =>
    ["NEW", "ASSIGNED", "PROCESSING", "QC_RETURNED"].includes(r.caseStatus),
  ).length;
  const qc = records.filter((r) => r.caseStatus === "READY_FOR_QC").length;
  const mr = records.filter((r) => ["QC_APPROVED", "MEDICAL_REVIEW"].includes(r.caseStatus)).length;
  const final = records.filter((r) => ["FINAL", "FINALIZED"].includes(r.caseStatus)).length;
  const serious = records.filter((r) => r.seriousnessStatus === "SERIOUS").length;

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Case Processing</span>
          <h1>Safety Cases</h1>
          <p>One operational line listing for processing, QC, Medical Review and finalization.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => void load()}>Refresh</button>
          <Link href="/intake">+ New Intake</Link>
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.queueStrip} aria-label="Case queue counts">
        <QueueCount label="Open" value={records.length - final} />
        <QueueCount label="Processing" value={processing} />
        <QueueCount label="Serious" value={serious} tone="danger" />
        <QueueCount label="Awaiting QC" value={qc} />
        <QueueCount label="Awaiting MR" value={mr} />
        <QueueCount label="Finalized" value={final} tone="good" />
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search case, intake ID, status, priority, owner…"
              aria-label="Search safety cases"
            />
          </div>
          <div className={styles.toolbarMeta}>
            <strong>{filtered.length}</strong>
            <span>cases shown</span>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Intake</th>
                <th>Seriousness</th>
                <th>Priority</th>
                <th>Stage</th>
                <th>Owner</th>
                <th>Draft</th>
                <th>Version</th>
                <th>Updated</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.caseId}>
                  <td><Link className={styles.caseLink} href={`/cases/${row.caseId}`}>{row.caseKey}</Link></td>
                  <td className={styles.mono}>{row.intakeRecordId}</td>
                  <td><span className={`${styles.flag} ${row.seriousnessStatus === "SERIOUS" ? styles.serious : ""}`}>{label(row.seriousnessStatus)}</span></td>
                  <td><span className={`${styles.priority} ${row.priority === "URGENT" || row.priority === "HIGH" ? styles.high : ""}`}>{label(row.priority)}</span></td>
                  <td><span className={`${styles.status} ${statusTone(row.caseStatus)}`}>{label(row.caseStatus)}</span></td>
                  <td>{row.assignedTo || <span className={styles.muted}>Unassigned</span>}</td>
                  <td>R{row.currentDraftRevision}</td>
                  <td>V{row.currentVersion}</td>
                  <td>{new Date(row.updatedAt).toLocaleString()}</td>
                  <td><Link className={styles.openLink} href={`/cases/${row.caseId}`}>Open</Link></td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    <strong>No cases in this queue.</strong>
                    <span>New cases appear after the controlled Intake lifecycle and case disposition.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function QueueCount({ label, value, tone = "" }: { label: string; value: number; tone?: "" | "danger" | "good" }) {
  return (
    <div className={`${styles.queueCount} ${tone ? styles[tone] : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
