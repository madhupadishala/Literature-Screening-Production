"use client";

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
  seriousnessStatus: string;
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

function dateTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function statusTone(status: string): string {
  if (["VERIFIED", "COMPLETE", "ACCEPTED", "EDITED"].includes(status)) {
    return styles.success;
  }
  if (["FAILED", "REJECTED"].includes(status)) return styles.danger;
  if (["IN_PROGRESS", "PENDING", "NOT_STARTED"].includes(status)) {
    return styles.warning;
  }
  return styles.neutral;
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
      const response = await fetch("/api/safety/intake?limit=500", {
        cache: "no-store",
      });
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
      const response = await fetch(`/api/safety/intake/${intakeId}`, {
        cache: "no-store",
      });
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
            .map((suggestion) => [
              suggestion.id,
              jsonText(suggestion.suggestedPayload),
            ]),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake workspace.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadRecords(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedId) return;
    const workspaceLoad = window.setTimeout(
      () => void loadWorkspace(selectedId),
      0,
    );
    return () => window.clearTimeout(workspaceLoad);
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
        record.sourceReviewStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, records]);

  const pendingReview = records.filter(
    (record) => record.sourceReviewStatus !== "VERIFIED",
  ).length;
  const verified = records.filter(
    (record) => record.sourceReviewStatus === "VERIFIED",
  ).length;
  const extractionPending = records.filter(
    (record) =>
      record.extractionStatus === "PENDING" ||
      record.extractionStatus === "FAILED",
  ).length;

  async function postAction(
    url: string,
    body: Record<string, unknown>,
    actionName: string,
  ) {
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
      setMessage("Action completed and audit trail updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The requested Intake action failed.");
    } finally {
      setBusy("");
    }
  }

  async function runExtraction() {
    if (!selectedId) return;
    await postAction(
      `/api/safety/intake/${selectedId}/extraction`,
      { reason },
      "extract",
    );
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
    await postAction(
      `/api/safety/intake/${selectedId}/source-review`,
      { reason },
      "verify",
    );
  }

  const primaryDocument = workspace?.documents[0] ?? null;
  const sourceText =
    primaryDocument && display(primaryDocument.extracted_text, "")
      ? display(primaryDocument.extracted_text, "")
      : jsonText(workspace?.source.payload ?? {});

  const pendingSuggestions =
    workspace?.suggestions.filter((item) => item.status === "PENDING") ?? [];
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

      <section className={styles.hero}>
        <div>
          <span className={styles.kicker}>Nexus Intake · Sprint 4</span>
          <h1>Source Review & Extraction Workspace</h1>
          <p>
            Review the original safety source beside structured Nexus data. Extraction
            is assistive only; human decisions remain authoritative and auditable.
          </p>
        </div>
        <div className={styles.heroStatus}>
          <span>Regulated boundary</span>
          <strong>Source → Suggestion → Human Decision → Structured Intake</strong>
        </div>
      </section>

      <section className={styles.metrics}>
        <Metric label="Intake records" value={records.length} />
        <Metric label="Awaiting source review" value={pendingReview} />
        <Metric label="Extraction attention" value={extractionPending} />
        <Metric label="Source verified" value={verified} />
      </section>

      <section className={styles.layout}>
        <div className={styles.worklist}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>Processor worklist</span>
              <h2>Intake Queue</h2>
            </div>
            <button type="button" onClick={() => void loadRecords()}>
              Refresh
            </button>
          </div>

          <div className={styles.searchRow}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Intake ID, source, channel…"
              aria-label="Search Intake worklist"
            />
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Intake</th>
                  <th>Source</th>
                  <th>Review</th>
                  <th>Extraction</th>
                  <th>Pending</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr
                    key={record.intakeRecordId}
                    className={
                      selectedId === record.intakeRecordId ? styles.selectedRow : ""
                    }
                    onClick={() => setSelectedId(record.intakeRecordId)}
                  >
                    <td>
                      <strong>{record.intakeKey}</strong>
                      <small>{record.intakeChannel}</small>
                    </td>
                    <td>
                      <strong>{record.sourceType}</strong>
                      <small>{record.sourceSystem}</small>
                    </td>
                    <td>
                      <Status value={record.sourceReviewStatus} />
                    </td>
                    <td>
                      <Status value={record.extractionStatus || "N/A"} />
                    </td>
                    <td>{record.pendingSuggestionCount}</td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      No Intake records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.workspace}>
          {!workspace ? (
            <div className={styles.placeholder}>
              <strong>Select an Intake record</strong>
              <p>
                The source evidence, extraction suggestions and structured data will
                appear here.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.workspaceHeader}>
                <div>
                  <span className={styles.kicker}>Active Intake</span>
                  <h2>{display(workspace.intake.intake_key)}</h2>
                  <p>
                    {display(workspace.source.sourceType)} ·{" "}
                    {display(workspace.source.sourceSystem)} · received{" "}
                    {dateTime(workspace.source.receivedAt)}
                  </p>
                </div>
                <Status
                  value={display(workspace.intake.source_review_status, "NOT_STARTED")}
                />
              </div>

              <div className={styles.actionBar}>
                <label>
                  <span>Audit reason</span>
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void runExtraction()}
                  disabled={
                    busy !== "" ||
                    !primaryDocument ||
                    display(workspace.intake.source_review_status) === "VERIFIED"
                  }
                >
                  {busy === "extract" ? "Extracting…" : "Run extraction"}
                </button>
                <button
                  type="button"
                  className={styles.verifyButton}
                  onClick={() => void completeReview()}
                  disabled={
                    busy !== "" ||
                    pendingSuggestions.length > 0 ||
                    documentExtractionStatus === "PENDING" ||
                    documentExtractionStatus === "IN_PROGRESS" ||
                    display(workspace.intake.source_review_status) === "VERIFIED"
                  }
                >
                  {busy === "verify" ? "Verifying…" : "Verify source review"}
                </button>
              </div>

              {message ? <div className={styles.message}>{message}</div> : null}

              <div className={styles.split}>
                <section className={styles.sourcePanel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <span className={styles.kicker}>Original evidence</span>
                      <h3>Source</h3>
                    </div>
                    {primaryDocument ? (
                      <Status value={display(primaryDocument.extraction_status)} />
                    ) : null}
                  </div>

                  {primaryDocument ? (
                    <>
                    <dl className={styles.metadata}>
                      <div>
                        <dt>File</dt>
                        <dd>{display(primaryDocument.file_name)}</dd>
                      </div>
                      <div>
                        <dt>Type</dt>
                        <dd>{display(primaryDocument.content_type)}</dd>
                      </div>
                      <div>
                        <dt>SHA-256</dt>
                        <dd className={styles.mono}>
                          {display(primaryDocument.content_sha256)}
                        </dd>
                      </div>
                    </dl>
                    <a
                      className={styles.sourceLink}
                      href={originalSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original source
                    </a>
                    {display(primaryDocument.content_type) === "application/pdf" ? (
                      <iframe
                        className={styles.sourceFrame}
                        src={originalSourceUrl}
                        title={`Original source ${display(primaryDocument.file_name)}`}
                      />
                    ) : null}
                    </>
                  ) : (
                    <p className={styles.note}>
                      Structured source. Review the source payload and existing
                      structured entities directly.
                    </p>
                  )}

                  <pre className={styles.sourceText}>{sourceText}</pre>
                </section>

                <section className={styles.structuredPanel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <span className={styles.kicker}>Human-governed data</span>
                      <h3>Structured Intake</h3>
                    </div>
                  </div>

                  <EntityGroup title="Patient" records={workspace.patients} />
                  <EntityGroup title="Reporter" records={workspace.reporters} />
                  <EntityGroup title="Product" records={workspace.products} />
                  <EntityGroup title="Event" records={workspace.events} />
                  <EntityGroup title="Tests" records={workspace.tests} />
                </section>
              </div>

              <section className={styles.suggestions}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.kicker}>Assistive extraction</span>
                    <h3>Suggestions requiring human decision</h3>
                  </div>
                  <span className={styles.counter}>
                    {pendingSuggestions.length} pending
                  </span>
                </div>

                <div className={styles.suggestionGrid}>
                  {workspace.suggestions.map((suggestion) => (
                    <article key={suggestion.id} className={styles.suggestionCard}>
                      <div className={styles.suggestionTop}>
                        <div>
                          <strong>{suggestion.suggestionType}</strong>
                          <small>{suggestion.entityKey}</small>
                        </div>
                        <span className={styles.confidence}>
                          {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </div>

                      <blockquote>{suggestion.evidenceText}</blockquote>

                      <textarea
                        value={
                          edits[suggestion.id] ??
                          jsonText(
                            suggestion.finalPayload ?? suggestion.suggestedPayload,
                          )
                        }
                        onChange={(event) =>
                          setEdits((current) => ({
                            ...current,
                            [suggestion.id]: event.target.value,
                          }))
                        }
                        disabled={suggestion.status !== "PENDING"}
                        aria-label={`Edit ${suggestion.suggestionType} suggestion`}
                      />

                      <div className={styles.suggestionFooter}>
                        <Status value={suggestion.status} />
                        {suggestion.status === "PENDING" ? (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                void reviewSuggestion(suggestion, "ACCEPTED")
                              }
                              disabled={busy !== ""}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void reviewSuggestion(suggestion, "EDITED")
                              }
                              disabled={busy !== ""}
                            >
                              Accept edited
                            </button>
                            <button
                              type="button"
                              className={styles.rejectButton}
                              onClick={() =>
                                void reviewSuggestion(suggestion, "REJECTED")
                              }
                              disabled={busy !== ""}
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}

                  {workspace.suggestions.length === 0 ? (
                    <div className={styles.emptyCard}>
                      No extraction suggestions yet. Document sources can run the
                      zero-cost parser; structured sources can be reviewed directly.
                    </div>
                  ) : null}
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`${styles.status} ${statusTone(value)}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function EntityGroup({
  title,
  records,
}: {
  title: string;
  records: Array<Record<string, unknown>>;
}) {
  return (
    <div className={styles.entityGroup}>
      <div className={styles.entityTitle}>
        <strong>{title}</strong>
        <span>{records.length}</span>
      </div>
      {records.length ? (
        records.map((record, index) => (
          <pre key={String(record.id || index)}>{jsonText(record)}</pre>
        ))
      ) : (
        <p>Not yet confirmed.</p>
      )}
    </div>
  );
}
