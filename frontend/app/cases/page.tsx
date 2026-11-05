"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalMetricStrip from "@/components/enterprise/OperationalMetricStrip";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataGrid, type DataGridProps } from "@/components/ui/DataGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
function timestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : `${DATE_FORMAT.format(date)} UTC`;
}
function statusTone(status: string): "success" | "warning" | "danger" | "info" {
  if (["FINAL", "FINALIZED", "QC_APPROVED"].includes(status)) return "success";
  if (status === "QC_RETURNED") return "danger";
  if (["READY_FOR_QC", "MEDICAL_REVIEW"].includes(status)) return "warning";
  return "info";
}
export default function CasesPage() {
  const { state: workspaceState } = useWorkspaceContext();
  const context = workspaceState.context;
  const scopeKey = context
    ? [context.tenantId, context.workspaceId, context.environment, context.moduleKey].join(":")
    : "";
  const [records, setRecords] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [seriousness, setSeriousness] = useState("");
  const [assignee, setAssignee] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    if (!scopeKey) {
      setRecords([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    setRecords([]);
    try {
      const response = await fetch("/api/safety/cases?limit=500", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success || !Array.isArray(payload.data?.records)) {
        throw new Error(payload?.error || "Unable to load case worklist.");
      }
      if (!controller.signal.aborted) setRecords(payload.data.records);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to load cases.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [scopeKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      activeRequest.current?.abort();
    };
  }, [load]);

  const statuses = useMemo(() => [...new Set(records.map((r) => r.caseStatus).filter(Boolean))].sort(), [records]);
  const seriousnessOptions = useMemo(() => [...new Set(records.map((r) => r.seriousnessStatus).filter(Boolean))].sort(), [records]);
  const assignees = useMemo(() => [...new Set(records.map((r) => r.assignedTo).filter((v): v is string => Boolean(v)))].sort(), [records]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return records.filter((r) =>
      (!status || r.caseStatus === status) &&
      (!seriousness || r.seriousnessStatus === seriousness) &&
      (!assignee || r.assignedTo === assignee) &&
      (!term || [r.caseKey, r.intakeRecordId, r.caseStatus, r.priority, r.seriousnessStatus, r.assignedTo || ""].some((v) => v.toLowerCase().includes(term)))
    );
  }, [records, query, status, seriousness, assignee]);

  const columns: DataGridProps<CaseRow>["columns"] = [
    { key: "case", header: "Case", render: (r) => <Link className={styles.identifier} href={`/cases/${encodeURIComponent(r.caseId)}`}>{r.caseKey}</Link> },
    { key: "status", header: "Status", render: (r) => <Badge tone={statusTone(r.caseStatus)}>{r.caseStatus.replaceAll("_", " ")}</Badge> },
    { key: "priority", header: "Priority", render: (r) => r.priority },
    { key: "seriousness", header: "Seriousness", render: (r) => r.seriousnessStatus },
    { key: "assignee", header: "Assignee", render: (r) => r.assignedTo || "Unassigned" },
    { key: "draft", header: "Draft", render: (r) => `R${r.currentDraftRevision}` },
    { key: "version", header: "Final", render: (r) => `V${r.currentVersion}` },
    { key: "updated", header: "Updated (UTC)", render: (r) => <time dateTime={r.updatedAt}>{timestamp(r.updatedAt)}</time> },
    { key: "action", header: "Action", render: (r) => <Link href={`/cases/${encodeURIComponent(r.caseId)}`}>Open case</Link> },
  ];

  return (
    <ApplicationShell module="CASE_PROCESSING">
      <OperationalScreenHeader compact eyebrow="Case Processing" title="Case worklist" description=""
        actions={<Button variant="secondary" type="button" loading={loading} onClick={() => void load()}>Refresh</Button>} />
      <OperationalMetricStrip compact metrics={[
        { label: "Cases in fetched window", value: loading || error ? "—" : records.length },
        { label: "Processing", value: loading || error ? "—" : records.filter((r) => ["NEW", "ASSIGNED", "PROCESSING", "QC_RETURNED"].includes(r.caseStatus)).length },
        { label: "In review", value: loading || error ? "—" : records.filter((r) => ["READY_FOR_QC", "QC_APPROVED", "MEDICAL_REVIEW"].includes(r.caseStatus)).length, tone: "attention" },
        { label: "Final", value: loading || error ? "—" : records.filter((r) => ["FINAL", "FINALIZED"].includes(r.caseStatus)).length, tone: "positive" },
      ]} />
      <section className={styles.panel} aria-label="Scoped safety case worklist">
        <div className={styles.toolbar}>
          <h2>Safety cases</h2>
          <div className={styles.filters}>
            <Input aria-label="Search cases" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cases…" />
            <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
            </Select>
            <Select aria-label="Filter by seriousness" value={seriousness} onChange={(e) => setSeriousness(e.target.value)}>
              <option value="">All seriousness</option>
              {seriousnessOptions.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}
            </Select>
            <Select aria-label="Filter by assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">All assignees</option>
              {assignees.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </div>
        </div>
        <DataGrid rows={filtered} columns={columns} rowKey={(r) => r.caseId} loading={loading}
          error={error || undefined} onRetry={() => void load()}
          emptyMessage="No cases in the fetched client workspace match these filters."
          emptyAction={records.length ? { label: "Clear filters", onClick: () => { setQuery(""); setStatus(""); setSeriousness(""); setAssignee(""); } } : undefined}
        />
        <p className={styles.scopeNote}>Filters apply to the scoped API response (maximum 500 cases). No server-side pagination is exposed by the current endpoint.</p>
      </section>
    </ApplicationShell>
  );
}
