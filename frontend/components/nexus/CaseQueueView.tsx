"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  updatedAt: string;
};

function human(value: string): string {
  return value.replaceAll("_", " ");
}

export default function CaseQueueView({
  mode,
}: {
  mode: "processing" | "finalized";
}) {
  const [records, setRecords] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/safety/cases?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load cases.");
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
    const stageRecords = records.filter((record) =>
      mode === "processing"
        ? ["NEW", "ASSIGNED", "PROCESSING", "QC_RETURNED"].includes(record.caseStatus)
        : ["FINAL", "FINALIZED"].includes(record.caseStatus),
    );
    const term = query.trim().toLowerCase();
    if (!term) return stageRecords;
    return stageRecords.filter((record) =>
      [record.caseKey, record.intakeRecordId, record.caseStatus, record.priority, record.seriousnessStatus, record.assignedTo || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [mode, query, records]);

  return (
    <main className="app-shell" id="main-content">
      <section className="cq-header">
        <div>
          <span>Case Processing</span>
          <h1>{mode === "processing" ? "Processing Queue" : "Finalized Cases"}</h1>
          <p>{mode === "processing" ? "Active L2A cases owned by processing before QC." : "Immutable finalized case versions retained in the operational line listing."}</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </section>
      {message ? <div className="cq-message">{message}</div> : null}
      <section className="cq-panel">
        <div className="cq-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case, intake, status, owner…" />
          <strong>{filtered.length} cases</strong>
        </div>
        <div className="cq-table-wrap">
          <table>
            <thead><tr><th>Case ID</th><th>Intake</th><th>Status</th><th>Priority</th><th>Seriousness</th><th>Owner</th><th>Draft</th><th>Version</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.caseId}>
                  <td><strong>{row.caseKey}</strong></td>
                  <td>{row.intakeRecordId}</td>
                  <td><span className="cq-pill">{human(row.caseStatus)}</span></td>
                  <td>{human(row.priority)}</td>
                  <td>{human(row.seriousnessStatus)}</td>
                  <td>{row.assignedTo || "Unassigned"}</td>
                  <td>R{row.currentDraftRevision}</td>
                  <td>V{row.currentVersion}</td>
                  <td>{new Date(row.updatedAt).toLocaleString()}</td>
                  <td><Link href={`/cases/${row.caseId}`}>Open</Link></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={10} className="cq-empty">No cases in this queue.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .cq-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:4px 2px 14px}.cq-header span{color:#0f6db7;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.cq-header h1{margin:3px 0 0;color:#102a43;font-size:25px;letter-spacing:-.035em}.cq-header p{margin:6px 0 0;color:#64748b;font-size:11px}.cq-header button{height:33px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:9px;font-weight:800;cursor:pointer}.cq-message{margin-bottom:10px;padding:9px 11px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;color:#1e3a8a;font-size:10px}.cq-panel{border:1px solid #dce4ed;border-radius:8px;background:#fff;overflow:hidden}.cq-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #e7edf3;background:#fbfcfe}.cq-toolbar input{width:min(520px,100%);height:33px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px}.cq-toolbar strong{color:#526579;font-size:9px}.cq-table-wrap{overflow:auto}.cq-table-wrap table{width:100%;min-width:1050px;border-collapse:collapse;font-size:10px}.cq-table-wrap th{padding:9px 10px;border-bottom:1px solid #dce4ed;background:#f5f7fa;color:#526579;text-align:left;font-size:8px;font-weight:900;text-transform:uppercase;white-space:nowrap}.cq-table-wrap td{padding:10px;border-bottom:1px solid #edf1f5;color:#334155}.cq-table-wrap tbody tr:hover td{background:#f8fbff}.cq-table-wrap a{display:inline-flex;padding:5px 8px;border:1px solid #c5d4e6;border-radius:5px;color:#0f5fa8;text-decoration:none;font-size:9px;font-weight:800}.cq-pill{display:inline-flex;padding:4px 7px;border-radius:4px;background:#eef2f6;color:#475569;font-size:8px;font-weight:900}.cq-empty{padding:42px!important;text-align:center!important;color:#718096!important}@media(max-width:760px){.cq-header{align-items:flex-start;flex-direction:column}.cq-toolbar{align-items:stretch;flex-direction:column}.cq-toolbar input{width:100%}}
      `}</style>
    </main>
  );
}
