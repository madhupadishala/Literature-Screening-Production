"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalMetricStrip from "@/components/enterprise/OperationalMetricStrip";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
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

function caseTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function statusTone(status: string): string {
  if (["FINAL", "FINALIZED", "QC_APPROVED"].includes(status)) return styles.good;
  if (["QC_RETURNED"].includes(status)) return styles.bad;
  if (["READY_FOR_QC", "MEDICAL_REVIEW"].includes(status)) return styles.review;
  return styles.neutral;
}

export default function CasesPage() {
  const { state: workspaceState } = useWorkspaceContext();
  const scopeKey = workspaceState.context ? `${workspaceState.context.tenantId}:${workspaceState.context.workspaceId}:${workspaceState.context.environment}:${workspaceState.context.moduleKey}` : "";
  const [records, setRecords] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!scopeKey) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/safety/cases?limit=500", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load case worklist.");
      }
      if (controller.signal.aborted) return;
      if (!Array.isArray(payload.data?.records)) throw new Error("Invalid case worklist response.");
      setRecords(payload.data.records);
      setLoadState("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRecords([]);
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load cases.");
    }
  }, [scopeKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); activeRequest.current?.abort(); };
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
        compact
        eyebrow="Case Processing"
        title="Case worklist"
        description=""
        actions={
          <button type="button" disabled={loadState === "loading"} onClick={() => void load()}>
            {loadState === "loading" ? "Loading…" : "Refresh"}
          </button>
        }
      />

      {message ? (
        <OperationalState
          compact
          kind="error"
          title="Case worklist unavailable"
          message={message}
          actions={<button type="button" onClick={() => void load()}>Retry</button>}
        />
      ) : null}

      <OperationalMetricStrip
        compact
        metrics={[
          { label: "Cases", value: loadState === "ready" ? records.length : "—" },
          {
            label: "Processing",
            value: loadState === "ready" ? records.filter((r) => ["NEW","ASSIGNED","PROCESSING","QC_RETURNED"].includes(r.caseStatus)).length : "—",
          },
          {
            label: "In review",
            value: loadState === "ready" ? records.filter((r) => ["READY_FOR_QC","QC_APPROVED","MEDICAL_REVIEW"].includes(r.caseStatus)).length : "—",
            tone: "attention",
          },
          {
            label: "Final",
            value: loadState === "ready" ? records.filter((r) => ["FINAL","FINALIZED"].includes(r.caseStatus)).length : "—",
            tone: "positive",
          },
        ]}
      />

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <h2>Safety cases</h2>
          <input
            aria-label="Search cases"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search case, status, priority…"
          />
        </div>

        <div className={styles.tableWrap}>
          <table aria-busy={loadState === "loading"}>
            <caption>Case-processing worklist for the selected tenant and client workspace</caption>
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Status</th>
                <th scope="col">Priority</th>
                <th scope="col">Seriousness</th>
                <th scope="col">Draft</th>
                <th scope="col">Final Version</th>
                <th scope="col">Updated</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadState === "ready" ? filtered.map((row) => (
                <tr key={row.caseId}>
                  <td className={styles.identifier}>
                    <Link href={`/cases/${row.caseId}`} title={`Intake: ${row.intakeRecordId}`}>{row.caseKey}</Link>
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
                  <td className={styles.identifier}><time dateTime={row.updatedAt}>{caseTimestamp(row.updatedAt)}</time></td>
                  <td>
                    <Link href={`/cases/${row.caseId}`}>Open case</Link>
                  </td>
                </tr>
              )) : null}
              {loadState !== "ready" || !filtered.length ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    <span role="status">{loadState === "loading" ? "Loading / Synchronizing cases..." : loadState === "error" ? "Case data unavailable." : records.length > 0 && query.trim() ? "Zero cases match current filters" : "Worklist empty (No pending cases in workspace)"}</span>
                    {loadState === "ready" && records.length > 0 && query.trim() && !filtered.length ? <button className={styles.clearFilters} type="button" onClick={() => setQuery("")}>Clear Filters</button> : null}
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
