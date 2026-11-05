"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataGrid, type DataGridProps } from "@/components/ui/DataGrid";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/Notice";
import { Select } from "@/components/ui/Select";
import styles from "./SubmissionWorkspace.module.css";

type Submission = {
  id: string;
  case_id: string;
  destination_key: string;
  message_profile: string;
  status: string;
  updated_at: string;
};

type PreflightFinding = Record<string, unknown>;
type PreflightResult = {
  readiness: string;
  findings: PreflightFinding[];
};
type SubmissionDetail = Record<string, unknown>;

function textValue(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}
function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC";
}
function tone(status: string): "success" | "danger" | "warning" | "info" {
  const normalized = status.toUpperCase();
  if (["READY", "VALIDATED", "ACKNOWLEDGED", "ACCEPTED"].includes(normalized)) return "success";
  if (["REJECTED", "FAILED", "ERROR"].includes(normalized)) return "danger";
  if (["PENDING", "DRAFT", "QUEUED", "IN_REVIEW"].includes(normalized)) return "warning";
  return "info";
}
function visibleFields(value: SubmissionDetail): Array<[string, string]> {
  return Object.entries(value)
    .filter(([key, entry]) => !["payload", "content", "raw_xml", "rawXml"].includes(key) && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"))
    .map(([key, entry]) => [key.replaceAll("_", " "), textValue(entry)]);
}

export default function SubmissionWorkspace() {
  const { state: workspace } = useWorkspaceContext();
  const context = workspace.context;
  const scopeKey = context ? [context.tenantId, context.workspaceId, context.environment, context.moduleKey].join(":") : "";
  const [records, setRecords] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [destination, setDestination] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState("");
  const [preflight, setPreflight] = useState<{ submissionId: string; result: PreflightResult } | null>(null);
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const activeList = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    activeList.current?.abort();
    setRecords([]);
    setSelectedId("");
    setDetail(null);
    setPreflight(null);
    setError("");
    if (!scopeKey) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    activeList.current = controller;
    setLoading(true);
    try {
      const response = await fetch("/api/submissions?limit=100", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success || !Array.isArray(payload.data?.records)) {
        throw new Error(payload?.error || "Unable to load submissions.");
      }
      if (!controller.signal.aborted) setRecords(payload.data.records);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load submissions.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      activeList.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!selectedId || !scopeKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDetail(null);
      setDetailError("");
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/submissions/${encodeURIComponent(selectedId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success || !payload.data || typeof payload.data !== "object") {
          throw new Error(payload?.error || "Unable to load package details.");
        }
        if (!controller.signal.aborted) setDetail(payload.data as SubmissionDetail);
      } catch (cause) {
        if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : "Unable to load package details.");
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedId, scopeKey]);

  const statuses = useMemo(() => [...new Set(records.map((r) => r.status))].sort(), [records]);
  const destinations = useMemo(() => [...new Set(records.map((r) => r.destination_key))].sort(), [records]);
  const filtered = useMemo(() => records.filter((r) =>
    (!status || r.status === status) &&
    (!destination || r.destination_key === destination) &&
    (!query.trim() || [r.case_id, r.id, r.destination_key, r.message_profile, r.status].some((v) => v.toLowerCase().includes(query.toLowerCase().trim())))
  ), [records, query, status, destination]);

  async function runPreflight(id: string) {
    if (busy || !scopeKey) return;
    setBusy(id);
    setActionError("");
    setAnnouncement("");
    setPreflight(null);
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(id)}/preflight`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success || !payload.data?.report) {
        throw new Error(payload?.error || "Preflight failed.");
      }
      const report = payload.data.report as PreflightResult;
      if (!Array.isArray(report.findings)) throw new Error("Invalid preflight report.");
      setPreflight({ submissionId: id, result: report });
      setAnnouncement(`Preflight ${report.readiness}: ${report.findings.length} finding(s). Evidence was recorded.`);
      setSelectedId(id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Preflight failed.");
    } finally {
      setBusy("");
    }
  }

  const columns: DataGridProps<Submission>["columns"] = [
    { key: "case", header: "Case", render: (r) => <code>{r.case_id.slice(0, 12)}</code> },
    { key: "destination", header: "Destination", render: (r) => r.destination_key },
    { key: "profile", header: "Profile", render: (r) => r.message_profile },
    { key: "status", header: "Status", render: (r) => <Badge tone={tone(r.status)}>{r.status.replaceAll("_", " ")}</Badge> },
    { key: "updated", header: "Updated (UTC)", render: (r) => <time dateTime={r.updated_at}>{formatDate(r.updated_at)}</time> },
    { key: "detail", header: "Package", render: (r) => <Button type="button" variant="secondary" onClick={() => { setSelectedId(r.id); setDetail(null); setPreflight(null); }}>Inspect</Button> },
    { key: "qualification", header: "Qualification", render: (r) => <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void runPreflight(r.id)} loading={busy === r.id}>Run preflight</Button> },
  ];

  return (
    <section className={styles.workspace} aria-label="ICSR submissions worklist">
      <Notice>
        <strong>Authority transmission is locked</strong>
        <p>Packages can be prepared and qualified; delivery remains disabled until authority onboarding and validation are approved.</p>
      </Notice>
      <div className={styles.toolbar}>
        <div className={styles.title}>
          <strong>Submission worklist</strong>
          <span>{loading || error ? "—" : records.length} package(s) in fetched client scope</span>
        </div>
        <div className={styles.filters}>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search submission packages" placeholder="Search packages…" />
          <Select aria-label="Filter submission status" value={status} onChange={(event) => setStatus(event.target.value)}
            options={[{ value: "", label: "All statuses" }, ...statuses.map((v) => ({ value: v, label: v.replaceAll("_", " ") }))]} />
          <Select aria-label="Filter destination" value={destination} onChange={(event) => setDestination(event.target.value)}
            options={[{ value: "", label: "All destinations" }, ...destinations.map((v) => ({ value: v, label: v }))]} />
          <Button type="button" variant="secondary" loading={loading} onClick={() => void load()}>Refresh</Button>
        </div>
      </div>
      {actionError ? <Notice tone="error">{actionError}</Notice> : null}
      {announcement ? <Notice tone="success">{announcement}</Notice> : null}
      <DataGrid rows={filtered} columns={columns} rowKey={(r) => r.id}
        loading={loading} error={error || undefined} onRetry={() => void load()}
        emptyMessage="No submission packages in the fetched workspace match the filters."
        emptyAction={records.length ? { label: "Clear filters", onClick: () => { setQuery(""); setStatus(""); setDestination(""); } } : undefined} />
      <p className={styles.scopeNote}>The existing endpoint returns a bounded list (maximum 100). Filters are applied within that scoped response.</p>
      {selectedId ? (
        <section className={styles.inspector} aria-label="Submission package inspector">
          <div className={styles.inspectorHeader}>
            <h2>Package details</h2>
            <Button type="button" variant="secondary" onClick={() => { setSelectedId(""); setDetail(null); setPreflight(null); }}>Close</Button>
          </div>
          {detailLoading ? <p role="status">Loading package details…</p> : null}
          {detailError ? <Notice tone="error">{detailError}</Notice> : null}
          {detail ? <dl className={styles.properties}>
            {visibleFields(detail).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
          </dl> : null}
          {preflight?.submissionId === selectedId ? (
            <div className={styles.findings}>
              <h3>Preflight · {preflight.result.readiness}</h3>
              {preflight.result.findings.length === 0 ? <p>No validation findings reported.</p> : (
                <ul>{preflight.result.findings.map((finding, index) =>
                  <li key={index}><strong>{textValue(finding.severity ?? finding.level, "Finding")}</strong>
                    <span>{textValue(finding.message ?? finding.description ?? finding.code, "See validation evidence.")}</span></li>)}</ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
