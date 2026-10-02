"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalMetricStrip from "@/components/enterprise/OperationalMetricStrip";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";
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

export default function CasesPage() {
  const [records, setRecords] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/safety/cases?limit=500", {
        cache: "no-store",
      });
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
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  return (
    <ApplicationShell>
      <OperationalScreenHeader
        eyebrow="Nexus Case Processing"
        title="L2A Case Worklist"
        description="Case-owned processing workspace with immutable revisions, QC, Medical Review, finalization and evidence controls."
        actions={
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      {message ? (
        <OperationalState
          kind="error"
          title="Case worklist unavailable"
          message={message}
          actions={<button type="button" onClick={() => void load()}>Retry</button>}
        />
      ) : null}

      <OperationalMetricStrip
        metrics={[
          { label: "Cases", value: records.length },
          {
            label: "Processing",
            value: records.filter((r) => ["NEW","ASSIGNED","PROCESSING","QC_RETURNED"].includes(r.caseStatus)).length,
          },
          {
            label: "In review",
            value: records.filter((r) => ["READY_FOR_QC","QC_APPROVED","MEDICAL_REVIEW"].includes(r.caseStatus)).length,
            tone: "attention",
          },
          {
            label: "Final",
            value: records.filter((r) => ["FINAL","FINALIZED"].includes(r.caseStatus)).length,
            tone: "positive",
          },
        ]}
      />

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div>
            <span>Processor queue</span>
            <h2>Safety Cases</h2>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search case, status, priority…"
          />
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Seriousness</th>
                <th>Draft</th>
                <th>Final Version</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.caseId}>
                  <td>
                    <strong>{row.caseKey}</strong>
                    <small>{row.intakeRecordId}</small>
                  </td>
                  <td>
                    <span className={`${styles.status} ${statusTone(row.caseStatus)}`}>
                      {row.caseStatus.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{row.priority}</td>
                  <td>{row.seriousnessStatus}</td>
                  <td>R{row.currentDraftRevision}</td>
                  <td>V{row.currentVersion}</td>
                  <td>{new Date(row.updatedAt).toLocaleString()}</td>
                  <td>
                    <Link href={`/cases/${row.caseId}`}>Open case</Link>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    No cases match the current worklist filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ApplicationShell>
  );
}
