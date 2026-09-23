"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type IntakeRow = {
  intakeRecordId: string;
  intakeKey: string;
  sourceType: string;
  sourceSystem: string;
  intakeChannel: string;
  priority: string;
  seriousnessStatus: string;
  sourceReviewStatus: string;
  duplicateReviewStatus: string;
  duplicateStatus: string;
  caseRelationship: string | null;
  triageStatus: string;
  dispositionStatus: string;
  dispositionType: string | null;
  updatedAt: string;
};

function human(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export default function CaseDuplicateGate() {
  const [records, setRecords] = useState<IntakeRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/safety/intake?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load pre-case records.");
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load duplicate gate.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const candidates = records.filter(
      (record) => record.sourceReviewStatus === "VERIFIED" && record.dispositionStatus !== "COMPLETE",
    );
    const term = query.trim().toLowerCase();
    if (!term) return candidates;
    return candidates.filter((record) =>
      [record.intakeKey, record.sourceType, record.sourceSystem, record.priority, record.seriousnessStatus, record.caseRelationship || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  return (
    <main className="app-shell" id="main-content">
      <section className="dg-header">
        <div>
          <span>Case Processing</span>
          <h1>Case Duplicate & Follow-up Check</h1>
          <p>Duplicate/follow-up assessment is a gate before creating a new L2A case or linking new follow-up information.</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </section>
      {message ? <div className="dg-message">{message}</div> : null}
      <section className="dg-rule">
        <strong>Gate rule</strong>
        <span>Incoming record → duplicate search → duplicate / follow-up / new → only non-duplicate records continue into the case lifecycle.</span>
      </section>
      <section className="dg-panel">
        <div className="dg-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search intake, source, priority, relationship…" />
          <strong>{filtered.length} records</strong>
        </div>
        <div className="dg-table-wrap">
          <table>
            <thead><tr><th>Intake ID</th><th>Source</th><th>Priority</th><th>Seriousness</th><th>Duplicate Review</th><th>Relationship</th><th>Triage</th><th>Disposition</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.intakeRecordId}>
                  <td><strong>{record.intakeKey}</strong><small>{record.intakeChannel}</small></td>
                  <td>{record.sourceType}<small>{record.sourceSystem}</small></td>
                  <td>{human(record.priority)}</td>
                  <td>{human(record.seriousnessStatus)}</td>
                  <td><span className="dg-pill">{human(record.duplicateReviewStatus)}</span></td>
                  <td>{human(record.caseRelationship)}</td>
                  <td>{human(record.triageStatus)}</td>
                  <td>{human(record.dispositionType || record.dispositionStatus)}</td>
                  <td>{new Date(record.updatedAt).toLocaleString()}</td>
                  <td><Link href={`/intake/${record.intakeRecordId}/duplicate-review?context=case`}>Open check</Link></td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={10} className="dg-empty">No records are currently waiting at the case duplicate gate.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .dg-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:4px 2px 14px}.dg-header span{color:#0f6db7;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.dg-header h1{margin:3px 0 0;color:#102a43;font-size:25px;letter-spacing:-.035em}.dg-header p{margin:6px 0 0;color:#64748b;font-size:11px}.dg-header button{height:33px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:9px;font-weight:800;cursor:pointer}.dg-message{margin-bottom:10px;padding:9px 11px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;color:#1e3a8a;font-size:10px}.dg-rule{display:flex;gap:10px;margin-bottom:10px;padding:9px 12px;border:1px solid #b8d7f4;border-radius:6px;background:#f0f7ff;color:#36516f;font-size:9px}.dg-rule strong{color:#0f5fa8}.dg-panel{border:1px solid #dce4ed;border-radius:8px;background:#fff;overflow:hidden}.dg-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #e7edf3;background:#fbfcfe}.dg-toolbar input{width:min(540px,100%);height:33px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:10px}.dg-toolbar strong{color:#526579;font-size:9px}.dg-table-wrap{overflow:auto}.dg-table-wrap table{width:100%;min-width:1180px;border-collapse:collapse;font-size:10px}.dg-table-wrap th{padding:9px 10px;border-bottom:1px solid #dce4ed;background:#f5f7fa;color:#526579;text-align:left;font-size:8px;font-weight:900;text-transform:uppercase;white-space:nowrap}.dg-table-wrap td{padding:10px;border-bottom:1px solid #edf1f5;color:#334155}.dg-table-wrap td strong,.dg-table-wrap td small{display:block}.dg-table-wrap td small{margin-top:3px;color:#718096}.dg-table-wrap a{display:inline-flex;padding:5px 8px;border:1px solid #c5d4e6;border-radius:5px;color:#0f5fa8;text-decoration:none;font-size:9px;font-weight:800}.dg-pill{display:inline-flex;padding:4px 7px;border-radius:4px;background:#eef2f6;color:#475569;font-size:8px;font-weight:900}.dg-empty{padding:42px!important;text-align:center!important;color:#718096!important}@media(max-width:760px){.dg-header{align-items:flex-start;flex-direction:column}.dg-toolbar{align-items:stretch;flex-direction:column}.dg-toolbar input{width:100%}.dg-rule{flex-direction:column}}
      `}</style>
    </main>
  );
}
