"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import OperationalMetricStrip from "@/components/enterprise/OperationalMetricStrip";
import OperationalState from "@/components/enterprise/OperationalState";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import styles from "./IntakeOperationalQueue.module.css";

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
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value).replaceAll("_", " ");
}

function stageStatus(record: IntakeRecord, queue: QueueKind) {
  if (queue === "DUPLICATE") return record.duplicateReviewStatus || "NOT_STARTED";
  if (queue === "TRIAGE") return record.triageStatus || "NOT_STARTED";
  return record.triageOutcome || record.triageStatus || "NOT_STARTED";
}

function recordHref(record: IntakeRecord, queue: QueueKind) {
  if (queue === "DUPLICATE") return `/intake/${encodeURIComponent(record.intakeRecordId)}/duplicate-review`;
  return `/intake/${encodeURIComponent(record.intakeRecordId)}/triage`;
}

export default function IntakeOperationalQueue({ queue }: { queue: QueueKind }) {
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/safety/intake?limit=500", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Intake operational queue.");
      }
      if (!signal?.aborted) {
        setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
      }
    } catch (error) {
      if (signal?.aborted) return;
      setMessage(error instanceof Error ? error.message : "Unable to load Intake operational queue.");
      setRecords([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) =>
      [
        record.intakeKey, record.sourceType, record.sourceSystem,
        record.intakeChannel, record.priority, record.countryCode || "",
        record.sourceReviewStatus, record.validityStatus,
        record.duplicateReviewStatus, record.triageStatus,
        record.triageOutcome || "", record.seriousnessStatus,
        record.dispositionStatus,
      ].join(" ").toLowerCase().includes(needle),
    );
  }, [query, records]);

  const columns = useMemo<Column<IntakeRecord>[]>(() => [
    { key: "intake", header: "Intake", render: (r) => <><strong>{display(r.intakeKey)}</strong><small className={styles.secondary}>{display(r.intakeChannel)}</small></> },
    { key: "source", header: "Source", render: (r) => <><strong>{display(r.sourceType)}</strong><small className={styles.secondary}>{display(r.sourceSystem)}</small></> },
    { key: "priority", header: "Priority", render: (r) => display(r.priority) },
    { key: "validity", header: "Validity", render: (r) => display(r.validityStatus) },
    { key: "seriousness", header: "Seriousness", render: (r) => display(r.seriousnessStatus) },
    { key: "duplicate", header: "Duplicate", render: (r) => display(r.duplicateReviewStatus) },
    { key: "triage", header: "Triage", render: (r) => display(r.triageStatus) },
    { key: "stage", header: LABELS[queue].stage, render: (r) => <span className={styles.stage}>{display(stageStatus(r, queue))}</span> },
    { key: "disposition", header: "Disposition", render: (r) => display(r.dispositionStatus) },
    { key: "action", header: "Action", render: (r) => <Link className={styles.action} href={recordHref(r, queue)}>{LABELS[queue].action}</Link> },
  ], [queue]);

  const verified = records.filter((r) => r.sourceReviewStatus === "VERIFIED").length;
  const actioned = records.filter((r) => stageStatus(r, queue) !== "NOT_STARTED").length;
  const attention = records.filter((r) => {
    const status = stageStatus(r, queue).toUpperCase();
    return ["PENDING", "REVIEW", "RETURN", "FAILED"].some((flag) => status.includes(flag));
  }).length;

  return (
    <>
      <OperationalMetricStrip metrics={[
        { label: "Visible Intake records", value: records.length },
        { label: "Source verified", value: verified, tone: "positive" },
        { label: `${LABELS[queue].stage} actioned`, value: actioned },
        { label: "Needs attention", value: attention, tone: attention ? "attention" : "neutral" },
      ]} />
      <OperationalState
        kind="info"
        title="Server-side workflow authority"
        message="This queue is an operational view only. Record actions remain authorized and validated by the existing governed Intake APIs."
        compact
      />
      <section className={styles.panel} aria-label={LABELS[queue].stage}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>Operational worklist</span>
            <h2 className={styles.title}>{LABELS[queue].stage}</h2>
          </div>
          <div className={styles.actions}>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Intake ID, source, status…"
              aria-label={`Search ${LABELS[queue].stage} queue`}
            />
            <Button variant="secondary" type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </header>
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(r) => r.intakeRecordId}
          loading={loading}
          error={message || undefined}
          onRetry={() => void load()}
          emptyMessage="Adjust the search filter. No records have been removed or reclassified."
        />
      </section>
    </>
  );
}
