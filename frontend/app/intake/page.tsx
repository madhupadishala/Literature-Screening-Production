"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./intake.module.css";

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
  specialSituations: string[];
  updatedAt: string;
};

type Suggestion = {
  id: string;
  suggestionType: string;
  entityKey: string;
  suggestedPayload: Record<string, unknown>;
  confidence: number;
  evidenceText: string;
  status: string;
  finalPayload: Record<string, unknown> | null;
  reviewReason: string | null;
};

type Workspace = {
  intake: Record<string, unknown>;
  source: {
    id?: unknown;
    sourceType?: unknown;
    sourceSystem?: unknown;
    externalReference?: unknown;
    receivedAt?: unknown;
    payload?: unknown;
    sha256?: unknown;
  };
  documents: Array<Record<string, unknown>>;
  patients: Array<Record<string, unknown>>;
  reporters: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  tests: Array<Record<string, unknown>>;
  extractionRuns: Array<Record<string, unknown>>;
  suggestions: Suggestion[];
};

function display(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function human(value: unknown): string {
  return display(value).replaceAll("_", " ");
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function lifecycleStage(row: IntakeRow): string {
  if (row.dispositionStatus === "COMPLETE") return "Disposed";
  if (row.caseRelationship === "DUPLICATE" && row.duplicateReviewStatus === "COMPLETE") {
    return "Duplicate closure";
  }
  if (row.status === "READY_FOR_DISPOSITION") return "Ready for disposition";
  if (row.triageStatus === "COMPLETE") return "QC / Medical Review";
  if (row.duplicateReviewStatus === "COMPLETE") return "Triage";
  if (row.sourceReviewStatus === "VERIFIED") return "Duplicate check";
  return "Booking / source review";
}

export default function IntakePage() {
  const [records, setRecords] = useState<IntakeRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState(
    "Processor reviewed the source evidence and extraction result.",
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/safety/intake?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Intake worklist.");
      }
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake worklist.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (intakeId: string) => {
    if (!intakeId) {
      setWorkspace(null);
      return;
    }
    try {
      const response = await fetch(`/api/safety/intake/${intakeId}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Intake workspace.");
      }
      const data = payload.data as Workspace;
      setWorkspace(data);
      setEdits(
        Object.fromEntries(
          data.suggestions
            .filter((suggestion) => suggestion.status === "PENDING")
            .map((suggestion) => [suggestion.id, jsonText(suggestion.suggestedPayload)]),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake workspace.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => void loadWorkspace(selectedId), 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadWorkspace]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      [
        record.intakeKey,
        record.sourceType,
        record.sourceSystem,
        record.intakeChannel,
        record.countryCode || "",
        record.status,
        record.priority,
        record.seriousnessStatus,
        record.sourceReviewStatus,
        record.duplicateReviewStatus,
        record.caseRelationship || "",
        record.triageStatus,
        record.dispositionStatus,
        lifecycleStage(record),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  const selectedRecord = records.find((record) => record.intakeRecordId === selectedId) ?? null;
  const sourceReviewOpen = records.filter((record) => record.sourceReviewStatus !== "VERIFIED").length;
  const duplicateOpen = records.filter(
    (record) => record.sourceReviewStatus === "VERIFIED" && record.duplicateReviewStatus !== "COMPLETE",
  ).length;
  const triageOpen = records.filter(
    (record) =>
      record.duplicateReviewStatus === "COMPLETE" &&
      record.caseRelationship !== "DUPLICATE" &&
      record.triageStatus !== "COMPLETE",
  ).length;
  const reviewOpen = records.filter(
    (record) => record.triageStatus === "COMPLETE" && record.status === "VALIDITY_REVIEW",
  ).length;

  async function postAction(url: string, body: Record<string, unknown>, actionName: string) {
    if (reason.trim().length < 10) {
      setMessage("A review reason of at least 10 characters is required.");
      return;
    }
    setBusy(actionName);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "The requested Intake action failed.");
      }
      setWorkspace(payload.data as Workspace);
      await loadRecords();
      await loadWorkspace(selectedId);
      setMessage("Action completed and audit trail updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The requested Intake action failed.");
    } finally {
      setBusy("");
    }
  }

  async function runExtraction() {
    if (!selectedId) return;
    await postAction(`/api/safety/intake/${selectedId}/extraction`, { reason }, "extract");
  }

  async function reviewSuggestion(
    suggestion: Suggestion,
    decision: "ACCEPTED" | "REJECTED" | "EDITED",
  ) {
    if (!selectedId) return;
    let finalPayload: Record<string, unknown> | undefined;
    if (decision === "EDITED") {
      try {
        const parsed = JSON.parse(edits[suggestion.id] || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Edited payload must be a JSON object.");
        }
        finalPayload = parsed as Record<string, unknown>;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Edited payload is invalid JSON.");
        return;
      }
    }
    await postAction(
      `/api/safety/intake/${selectedId}/suggestions/${suggestion.id}`,
      { decision, finalPayload, reason },
      `suggestion-${suggestion.id}`,
    );
  }

  async function completeReview() {
    if (!selectedId) return;
    await postAction(`/api/safety/intake/${selectedId}/source-review`, { reason }, "verify");
  }

  const primaryDocument = workspace?.documents[0] ?? null;
  const pendingSuggestions = workspace?.suggestions.filter((item) => item.status === "PENDING") ?? [];
  const documentExtractionStatus = primaryDocument
    ? display(primaryDocument.extraction_status, "PENDING")
    : "N/A";
  const originalSourceUrl =
    selectedId && primaryDocument?.id
      ? `/api/safety/intake/${selectedId}/documents/${String(primaryDocument.id)}`
      : "";

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.pageHeader}>
        <div>
          <span>Intake & Triage</span>
          <h1>Booking Queue</h1>
          <p>Receive, review and control incoming safety information before the mandatory duplicate gate.</p>
        </div>
        <button type="button" onClick={() => void loadRecords()}>Refresh</button>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.queueStrip}>
        <QueueCount label="Booked" value={records.length} />
        <QueueCount label="Source Review" value={sourceReviewOpen} />
        <QueueCount label="Duplicate Check" value={duplicateOpen} />
        <QueueCount label="Triage" value={triageOpen} />
        <QueueCount label="QC / MR" value={reviewOpen} />
      </section>

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div>
            <strong>Incoming Safety Reports</strong>
            <span>{filtered.length} records</span>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search intake, source, priority, stage…"
            aria-label="Search Intake Booking Queue"
          />
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Intake ID</th>
                <th>Source</th>
                <th>Priority</th>
                <th>Seriousness</th>
                <th>Source Review</th>
                <th>Duplicate</th>
                <th>Relationship</th>
                <th>Triage</th>
                <th>Lifecycle Stage</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr
                  key={record.intakeRecordId}
                  className={selectedId === record.intakeRecordId ? styles.selectedRow : ""}
                  onClick={() => setSelectedId(record.intakeRecordId)}
                >
                  <td><strong>{record.intakeKey}</strong><small>{record.intakeChannel}</small></td>
                  <td><strong>{record.sourceType}</strong><small>{record.sourceSystem}</small></td>
                  <td>{human(record.priority)}</td>
                  <td>{human(record.seriousnessStatus)}</td>
                  <td><Status value={record.sourceReviewStatus} /></td>
                  <td><Status value={record.duplicateReviewStatus} /></td>
                  <td>{human(record.caseRelationship)}</td>
                  <td><Status value={record.triageStatus} /></td>
                  <td><span className={styles.stage}>{lifecycleStage(record)}</span></td>
                  <td>{new Date(record.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && !filtered.length ? (
                <tr><td colSpan={10} className={styles.empty}>No Intake records found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {workspace && selectedRecord ? (
        <section className={styles.workspace}>
          <div className={styles.workspaceHeader}>
            <div>
              <span>Selected Intake</span>
              <h2>{selectedRecord.intakeKey}</h2>
              <p>{selectedRecord.sourceType} · {selectedRecord.sourceSystem} · {lifecycleStage(selectedRecord)}</p>
            </div>
            <div className={styles.nextActions}>
              {selectedRecord.sourceReviewStatus === "VERIFIED" && selectedRecord.duplicateReviewStatus !== "COMPLETE" ? (
                <Link href={`/intake/${selectedId}/duplicate-review`}>Duplicate / Follow-up Check</Link>
              ) : null}
              {selectedRecord.duplicateReviewStatus === "COMPLETE" &&
              selectedRecord.caseRelationship !== "DUPLICATE" &&
              selectedRecord.triageStatus !== "COMPLETE" ? (
                <Link href={`/intake/${selectedId}/triage`}>Open ICSR Triage</Link>
              ) : null}
              {selectedRecord.triageStatus === "COMPLETE" && selectedRecord.status === "VALIDITY_REVIEW" ? (
                <>
                  <Link href="/intake/qc-queue">QC Queue</Link>
                  <Link href="/intake/mr-queue">MR Queue</Link>
                </>
              ) : null}
              {(selectedRecord.status === "READY_FOR_DISPOSITION" ||
                (selectedRecord.caseRelationship === "DUPLICATE" && selectedRecord.duplicateReviewStatus === "COMPLETE")) ? (
                <Link href={`/intake/${selectedId}/disposition`}>Open Disposition</Link>
              ) : null}
            </div>
          </div>

          <div className={styles.reviewBar}>
            <label>
              <span>Audit reason</span>
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button
              type="button"
              onClick={() => void runExtraction()}
              disabled={busy !== "" || !primaryDocument || selectedRecord.sourceReviewStatus === "VERIFIED"}
            >
              {busy === "extract" ? "Extracting…" : "Run Extraction"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void completeReview()}
              disabled={
                busy !== "" ||
                pendingSuggestions.length > 0 ||
                documentExtractionStatus === "PENDING" ||
                documentExtractionStatus === "IN_PROGRESS" ||
                selectedRecord.sourceReviewStatus === "VERIFIED"
              }
            >
              {busy === "verify" ? "Verifying…" : "Verify Source Review"}
            </button>
          </div>

          <div className={styles.workspaceGrid}>
            <section className={styles.sourcePanel}>
              <div className={styles.sectionHeader}>
                <div><span>Original Evidence</span><h3>Source</h3></div>
                {primaryDocument ? <Status value={display(primaryDocument.extraction_status)} /> : null}
              </div>
              {primaryDocument ? (
                <>
                  <dl className={styles.metaGrid}>
                    <div><dt>File</dt><dd>{display(primaryDocument.file_name)}</dd></div>
                    <div><dt>Type</dt><dd>{display(primaryDocument.content_type)}</dd></div>
                    <div><dt>SHA-256</dt><dd>{display(primaryDocument.content_sha256)}</dd></div>
                  </dl>
                  <a className={styles.sourceLink} href={originalSourceUrl} target="_blank" rel="noreferrer">Open original source</a>
                </>
              ) : (
                <p className={styles.note}>Structured source. Review the source payload and structured entities directly.</p>
              )}
              <pre className={styles.sourceText}>{
                primaryDocument && display(primaryDocument.extracted_text, "")
                  ? display(primaryDocument.extracted_text, "")
                  : jsonText(workspace.source.payload ?? {})
              }</pre>
            </section>

            <section className={styles.structuredPanel}>
              <div className={styles.sectionHeader}><div><span>Structured Intake</span><h3>Confirmed Data</h3></div></div>
              <EntityGroup title="Patient" records={workspace.patients} />
              <EntityGroup title="Reporter" records={workspace.reporters} />
              <EntityGroup title="Product" records={workspace.products} />
              <EntityGroup title="Event" records={workspace.events} />
              <EntityGroup title="Tests" records={workspace.tests} />
            </section>
          </div>

          <section className={styles.suggestions}>
            <div className={styles.sectionHeader}>
              <div><span>Assistive Extraction</span><h3>Human Review Suggestions</h3></div>
              <strong>{pendingSuggestions.length} pending</strong>
            </div>
            <div className={styles.suggestionGrid}>
              {workspace.suggestions.map((suggestion) => (
                <article key={suggestion.id} className={styles.suggestionCard}>
                  <div className={styles.suggestionTop}>
                    <div><strong>{suggestion.suggestionType}</strong><small>{suggestion.entityKey}</small></div>
                    <span>{Math.round(suggestion.confidence * 100)}%</span>
                  </div>
                  <blockquote>{suggestion.evidenceText}</blockquote>
                  <textarea
                    value={edits[suggestion.id] ?? jsonText(suggestion.finalPayload ?? suggestion.suggestedPayload)}
                    onChange={(event) => setEdits((current) => ({ ...current, [suggestion.id]: event.target.value }))}
                    disabled={suggestion.status !== "PENDING"}
                  />
                  <div className={styles.suggestionFooter}>
                    <Status value={suggestion.status} />
                    {suggestion.status === "PENDING" ? (
                      <div>
                        <button type="button" onClick={() => void reviewSuggestion(suggestion, "ACCEPTED")} disabled={busy !== ""}>Accept</button>
                        <button type="button" onClick={() => void reviewSuggestion(suggestion, "EDITED")} disabled={busy !== ""}>Accept Edited</button>
                        <button type="button" className={styles.rejectButton} onClick={() => void reviewSuggestion(suggestion, "REJECTED")} disabled={busy !== ""}>Reject</button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {!workspace.suggestions.length ? (
                <div className={styles.emptyCard}>No extraction suggestions. Structured data can be reviewed directly.</div>
              ) : null}
            </div>
          </section>
        </section>
      ) : (
        <section className={styles.placeholder}>
          <strong>Select a Booking Queue record</strong>
          <span>Source review, extraction evidence and lifecycle actions will open here.</span>
        </section>
      )}
    </main>
  );
}

function QueueCount({ label, value }: { label: string; value: number }) {
  return <div className={styles.queueCount}><span>{label}</span><strong>{value}</strong></div>;
}

function Status({ value }: { value: string }) {
  const normalized = value || "NOT_STARTED";
  const tone = ["VERIFIED", "COMPLETE", "ACCEPTED", "EDITED"].includes(normalized)
    ? styles.good
    : ["FAILED", "REJECTED"].includes(normalized)
      ? styles.bad
      : styles.neutral;
  return <span className={`${styles.status} ${tone}`}>{human(normalized)}</span>;
}

function EntityGroup({ title, records }: { title: string; records: Array<Record<string, unknown>> }) {
  return (
    <div className={styles.entityGroup}>
      <div><strong>{title}</strong><span>{records.length}</span></div>
      {records.length ? records.map((record, index) => <pre key={String(record.id || index)}>{jsonText(record)}</pre>) : <p>Not yet confirmed.</p>}
    </div>
  );
}
