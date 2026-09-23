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
  countryCode: string | null;
  sourceReviewStatus: string;
  extractionStatus: string | null;
  pendingSuggestionCount: number;
  status: string;
  validityStatus: string;
  duplicateStatus: string;
  duplicateReviewStatus: string;
  caseRelationship: string | null;
  dispositionStatus: string;
  dispositionType: string | null;
  seriousnessStatus: string;
  triageStatus: string;
  triageOutcome: string | null;
  followUpRequired: boolean;
  updatedAt: string;
};

type TaskRow = {
  id: string;
  entityId: string;
  taskType: string;
  status: string;
  assignedTo: string | null;
  dueAt: string | null;
  updatedAt: string;
  intakeKey: string | null;
  caseKey: string | null;
  priority: string | null;
  seriousnessStatus: string | null;
  triageOutcome: string | null;
  caseRelationship: string | null;
  caseStatus: string | null;
};

export type IntakeStage = "duplicate" | "triage";

function human(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

export function IntakeStageQueue({ stage }: { stage: IntakeStage }) {
  const [records, setRecords] = useState<IntakeRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/safety/intake?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load Intake queue.");
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake queue.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const eligible = useMemo(() => {
    const stageRecords = records.filter((record) => {
      if (stage === "duplicate") {
        return record.sourceReviewStatus === "VERIFIED" && record.duplicateReviewStatus !== "COMPLETE";
      }
      return (
        record.duplicateReviewStatus === "COMPLETE" &&
        record.caseRelationship !== "DUPLICATE" &&
        record.triageStatus !== "COMPLETE"
      );
    });
    const term = query.trim().toLowerCase();
    if (!term) return stageRecords;
    return stageRecords.filter((record) =>
      [record.intakeKey, record.sourceType, record.sourceSystem, record.priority, record.seriousnessStatus, record.countryCode || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records, stage]);

  const title = stage === "duplicate" ? "Duplicate & Follow-up Check" : "ICSR Triage Queue";
  const description =
    stage === "duplicate"
      ? "Every verified incoming report is checked for duplicate or follow-up relationship before it enters formal triage."
      : "Only reports that cleared the duplicate gate enter formal ICSR validity and triage.";

  return (
    <main className="app-shell" id="main-content">
      <section className="oq-header">
        <div>
          <span>Intake & Triage</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </section>
      {message ? <div className="oq-message">{message}</div> : null}
      <section className="oq-panel">
        <div className="oq-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Intake ID, source, priority, country…" />
          <strong>{eligible.length} records</strong>
        </div>
        <div className="oq-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Intake ID</th>
                <th>Source</th>
                <th>Priority</th>
                <th>Seriousness</th>
                <th>Duplicate status</th>
                <th>Relationship</th>
                <th>Triage</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {eligible.map((record) => (
                <tr key={record.intakeRecordId}>
                  <td><strong>{record.intakeKey}</strong><small>{record.intakeChannel}</small></td>
                  <td>{record.sourceType}<small>{record.sourceSystem}</small></td>
                  <td>{human(record.priority)}</td>
                  <td>{human(record.seriousnessStatus)}</td>
                  <td><span className="oq-pill">{human(record.duplicateReviewStatus)}</span></td>
                  <td>{human(record.caseRelationship)}</td>
                  <td><span className="oq-pill">{human(record.triageStatus)}</span></td>
                  <td>{new Date(record.updatedAt).toLocaleString()}</td>
                  <td>
                    <Link href={stage === "duplicate" ? `/intake/${record.intakeRecordId}/duplicate-review` : `/intake/${record.intakeRecordId}/triage`}>
                      {stage === "duplicate" ? "Check" : "Triage"}
                    </Link>
                  </td>
                </tr>
              ))}
              {!eligible.length ? (
                <tr><td colSpan={9} className="oq-empty">No records are waiting in this queue.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <QueueStyles />
    </main>
  );
}

export function ReviewTaskQueue({
  entityType,
  taskType,
  title,
  description,
}: {
  entityType: "INTAKE_RECORD" | "CASE";
  taskType: "QC" | "MEDICAL_REVIEW" | "CASE_PROCESSING";
  title: string;
  description: string;
}) {
  const [records, setRecords] = useState<TaskRow[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(
        `/api/safety/review-tasks?entityType=${entityType}&taskType=${taskType}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load review queue.");
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load review queue.");
    }
  }, [entityType, taskType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      [record.intakeKey || "", record.caseKey || "", record.taskType, record.status, record.priority || "", record.seriousnessStatus || ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  return (
    <main className="app-shell" id="main-content">
      <section className="oq-header">
        <div>
          <span>{entityType === "INTAKE_RECORD" ? "Intake & Triage" : "Case Processing"}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </section>
      {message ? <div className="oq-message">{message}</div> : null}
      <section className="oq-panel">
        <div className="oq-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, priority, seriousness, status…" />
          <strong>{filtered.length} tasks</strong>
        </div>
        <div className="oq-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{entityType === "INTAKE_RECORD" ? "Intake ID" : "Case ID"}</th>
                <th>Task</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Seriousness</th>
                <th>Relationship / Stage</th>
                <th>Due</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td><strong>{record.intakeKey || record.caseKey || record.entityId}</strong></td>
                  <td>{human(record.taskType)}</td>
                  <td><span className="oq-pill">{human(record.status)}</span></td>
                  <td>{human(record.priority)}</td>
                  <td>{human(record.seriousnessStatus)}</td>
                  <td>{human(record.caseRelationship || record.caseStatus || record.triageOutcome)}</td>
                  <td>{record.dueAt ? new Date(record.dueAt).toLocaleString() : "—"}</td>
                  <td>{new Date(record.updatedAt).toLocaleString()}</td>
                  <td>
                    <Link href={entityType === "INTAKE_RECORD" ? `/intake/${record.entityId}/review?stage=${taskType === "QC" ? "qc" : "mr"}` : `/cases/${record.entityId}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr><td colSpan={9} className="oq-empty">No active tasks in this queue.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <QueueStyles />
    </main>
  );
}

function QueueStyles() {
  return (
    <style jsx>{`
      .oq-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:4px 2px 14px}.oq-header span{color:#0f6db7;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.oq-header h1{margin:3px 0 0;color:#102a43;font-size:25px;letter-spacing:-.035em}.oq-header p{margin:6px 0 0;color:#64748b;font-size:11px}.oq-header button{height:33px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:9px;font-weight:800;cursor:pointer}.oq-message{margin-bottom:10px;padding:9px 11px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;color:#1e3a8a;font-size:10px}.oq-panel{border:1px solid #dce4ed;border-radius:8px;background:#fff;overflow:hidden}.oq-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #e7edf3;background:#fbfcfe}.oq-toolbar input{width:min(520px,100%);height:33px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f172a;font-size:10px}.oq-toolbar strong{color:#526579;font-size:9px}.oq-table-wrap{overflow:auto}.oq-table-wrap table{width:100%;min-width:1050px;border-collapse:collapse;font-size:10px}.oq-table-wrap th{padding:9px 10px;border-bottom:1px solid #dce4ed;background:#f5f7fa;color:#526579;text-align:left;font-size:8px;font-weight:900;letter-spacing:.035em;text-transform:uppercase;white-space:nowrap}.oq-table-wrap td{padding:10px;border-bottom:1px solid #edf1f5;color:#334155;vertical-align:middle}.oq-table-wrap td strong,.oq-table-wrap td small{display:block}.oq-table-wrap td small{margin-top:3px;color:#718096}.oq-table-wrap tbody tr:hover td{background:#f8fbff}.oq-table-wrap a{display:inline-flex;padding:5px 8px;border:1px solid #c5d4e6;border-radius:5px;color:#0f5fa8;background:#fff;text-decoration:none;font-size:9px;font-weight:800}.oq-pill{display:inline-flex;padding:4px 7px;border-radius:4px;background:#eef2f6;color:#475569;font-size:8px;font-weight:900}.oq-empty{padding:42px!important;text-align:center!important;color:#718096!important}@media(max-width:760px){.oq-header{align-items:flex-start;flex-direction:column}.oq-toolbar{align-items:stretch;flex-direction:column}.oq-toolbar input{width:100%}}
    `}</style>
  );
}
