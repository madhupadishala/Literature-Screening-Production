"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import OperationalMetricStrip from "@/components/enterprise/OperationalMetricStrip";
import OperationalState from "@/components/enterprise/OperationalState";

type QueueKind = "DUPLICATE" | "TRIAGE" | "MEDICAL_REVIEW";

type IntakeRecord = {
  intakeRecordId: string;
  intakeKey: string;
  sourceType: string;
  sourceSystem: string;
  intakeChannel: string;
  priority: string;
  countryCode: string | null;
  sourceReviewStatus: string;
  validityStatus: string;
  duplicateReviewStatus: string;
  seriousnessStatus: string;
  triageStatus: string;
  triageOutcome: string | null;
  dispositionStatus: string;
};

const LABELS: Record<QueueKind, { stage: string; action: string }> = {
  DUPLICATE: { stage: "Duplicate review", action: "Open duplicate review" },
  TRIAGE: { stage: "Triage", action: "Open triage" },
  MEDICAL_REVIEW: { stage: "Medical review oversight", action: "Open governed record" },
};

function display(value: string | number | null | undefined, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value).replaceAll("_", " ");
}

function stageStatus(record: IntakeRecord, queue: QueueKind) {
  if (queue === "DUPLICATE") return record.duplicateReviewStatus || "NOT_STARTED";
  if (queue === "TRIAGE") return record.triageStatus || "NOT_STARTED";
  return record.triageOutcome || record.triageStatus || "NOT_STARTED";
}

function recordHref(record: IntakeRecord, queue: QueueKind) {
  if (queue === "DUPLICATE") return `/intake/${record.intakeRecordId}/duplicate-review`;
  return `/intake/${record.intakeRecordId}/triage`;
}

export default function IntakeOperationalQueue({ queue }: { queue: QueueKind }) {
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/safety/intake?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load Intake operational queue.");
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake operational queue.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [
        record.intakeKey,
        record.sourceType,
        record.sourceSystem,
        record.intakeChannel,
        record.priority,
        record.countryCode || "",
        record.sourceReviewStatus,
        record.validityStatus,
        record.duplicateReviewStatus,
        record.triageStatus,
        record.triageOutcome || "",
        record.seriousnessStatus,
        record.dispositionStatus,
      ].join(" ").toLowerCase().includes(needle),
    );
  }, [query, records]);

  const verified = records.filter((record) => record.sourceReviewStatus === "VERIFIED").length;
  const actioned = records.filter((record) => stageStatus(record, queue) !== "NOT_STARTED").length;
  const attention = records.filter((record) => {
    const value = stageStatus(record, queue).toUpperCase();
    return value.includes("PENDING") || value.includes("REVIEW") || value.includes("RETURN") || value.includes("FAILED");
  }).length;

  return (
    <>
      <OperationalMetricStrip
        metrics={[
          { label: "Visible Intake records", value: records.length },
          { label: "Source verified", value: verified, tone: "positive" },
          { label: `${LABELS[queue].stage} actioned`, value: actioned },
          { label: "Needs attention", value: attention, tone: attention ? "attention" : "neutral" },
        ]}
      />
      <OperationalState
        kind="info"
        title="Server-side workflow authority"
        message="This queue is an operational view only. It does not infer eligibility or bypass state transitions; record actions remain authorized and validated by the existing governed Intake APIs."
        compact
      />
      <section className="queue-panel">
        <header>
          <div>
            <span>OPERATIONAL WORKLIST</span>
            <h2>{LABELS[queue].stage}</h2>
            <p>Dense status view with direct access to the governed record workspace.</p>
          </div>
          <div className="queue-actions">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Intake ID, source, status…" aria-label={`Search ${LABELS[queue].stage} queue`} />
            <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>
        {message ? <OperationalState kind="error" title="Queue could not be loaded" message={message} compact /> : null}
        {!message && loading ? <OperationalState kind="loading" title="Loading Intake records" message="Existing governed state is unchanged while the queue refreshes." compact /> : null}
        {!message && !loading && visible.length === 0 ? <OperationalState kind="empty" title="No Intake records match this view" message="Adjust the search filter. No records have been removed or reclassified." compact /> : null}
        <div className="queue-table-wrap">
          <table>
            <thead><tr><th>Intake</th><th>Source</th><th>Priority</th><th>Validity</th><th>Seriousness</th><th>Duplicate</th><th>Triage</th><th>{LABELS[queue].stage}</th><th>Disposition</th><th>Action</th></tr></thead>
            <tbody>
              {visible.map((record) => (
                <tr key={record.intakeRecordId}>
                  <td><strong>{display(record.intakeKey)}</strong><small>{display(record.intakeChannel)}</small></td>
                  <td><strong>{display(record.sourceType)}</strong><small>{display(record.sourceSystem)}</small></td>
                  <td>{display(record.priority)}</td><td>{display(record.validityStatus)}</td><td>{display(record.seriousnessStatus)}</td>
                  <td>{display(record.duplicateReviewStatus)}</td><td>{display(record.triageStatus)}</td>
                  <td><span className="stage-status">{display(stageStatus(record, queue))}</span></td>
                  <td>{display(record.dispositionStatus)}</td><td><Link href={recordHref(record, queue)}>{LABELS[queue].action}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .queue-panel{margin-top:14px;border:1px solid var(--nx-color-border);border-radius:8px;background:var(--nx-color-surface);overflow:hidden}
        header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:16px;border-bottom:1px solid var(--nx-color-border)}
        header span{font-size:9px;font-weight:900;letter-spacing:.08em;color:var(--nx-color-interactive)} h2{margin:4px 0 0;font-size:18px} p{margin:4px 0 0;color:#64748b;font-size:11px}
        .queue-actions{display:flex;gap:8px}.queue-actions input{min-width:280px;height:36px;border:1px solid var(--nx-color-border);border-radius:6px;padding:0 10px}.queue-actions button{height:36px;border:1px solid var(--nx-color-border);border-radius:6px;background:#fff;padding:0 12px;font-weight:800;cursor:pointer}
        .queue-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:11px}th{padding:10px 12px;text-align:left;background:#f8fafc;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid var(--nx-color-border);white-space:nowrap}
        td{padding:11px 12px;border-bottom:1px solid #eef2f7;vertical-align:top;white-space:nowrap}td strong,td small{display:block}td small{margin-top:3px;color:#64748b}td a{color:var(--nx-color-interactive);font-weight:900;text-decoration:none}.stage-status{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef6ff;color:#174a7c;font-weight:800}
        @media(max-width:800px){header{align-items:stretch;flex-direction:column}.queue-actions{flex-direction:column}.queue-actions input{min-width:0;width:100%}}
      `}</style>
    </>
  );
}
