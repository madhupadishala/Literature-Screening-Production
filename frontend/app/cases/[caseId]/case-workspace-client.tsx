"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import styles from "./case-workspace.module.css";

type Workspace = {
  safetyCase: Record<string, unknown>;
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
  draft: {
    id: string;
    revision: number;
    payload: Record<string, unknown>;
    draftSha256: string;
    sourceKind: string;
    changeReason: string;
    createdAt: string;
  };
  assessments: Array<Record<string, unknown>>;
  narratives: Array<Record<string, unknown>>;
  assistSuggestions: Array<Record<string, unknown>>;
  reviewTasks: Array<Record<string, unknown>>;
  followUps: Array<Record<string, unknown>>;
  sourceDocuments: Array<Record<string, unknown>>;
  caseVersions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
  reviewActions: Array<Record<string, unknown>>;
  queries: Array<Record<string, unknown>>;
  finalizationChecks: Array<Record<string, unknown>>;
};

const TABS = [
  "General",
  "Reporter",
  "Patient",
  "Events",
  "Products",
  "Medical History",
  "Labs",
  "Assessments",
  "Narrative",
  "Attachments",
  "Reviews",
  "Evidence & Export",
  "Audit",
] as const;

type Tab = (typeof TABS)[number];

function display(value: unknown, fallback = "—"): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

export default function CaseWorkspaceClient({ caseId }: { caseId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("General");
  const [editors, setEditors] = useState<Record<string, string>>({});
  const [changeReason, setChangeReason] = useState(
    "Processor updated the governed case draft after source review.",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [assessment, setAssessment] = useState({
    productKey: "",
    eventKey: "",
    assessmentType: "COMPANY_CAUSALITY",
    result: "",
    rationale: "Processor completed the human product-event assessment.",
  });

  const [narrativeText, setNarrativeText] = useState("");
  const [reviewComment, setReviewComment] = useState(
    "Reviewer completed the governed case review action.",
  );
  const [queryText, setQueryText] = useState("");
  const [fieldPath, setFieldPath] = useState("");
  const [queryResponses, setQueryResponses] = useState<Record<string, string>>({});
  const [finalization, setFinalization] = useState<{
    ready: boolean;
    checks: Array<{ key: string; passed: boolean; message: string }>;
  } | null>(null);
  const [releaseArtifacts, setReleaseArtifacts] = useState<{
    evidencePackages: Array<Record<string, unknown>>;
    exports: Array<Record<string, unknown>>;
  }>({ evidencePackages: [], exports: [] });

  const hydrate = useCallback((data: Workspace) => {
    setWorkspace(data);
    const payload = data.draft.payload as Record<string, unknown>;
    setEditors({
      General: json(payload.identification),
      Reporter: json(payload.reporters),
      Patient: json(payload.patient),
      Events: json(payload.events),
      Products: json(payload.products),
      "Medical History": json(payload.medicalHistory),
      Labs: json(payload.tests),
      Additional: json(payload.additionalInformation),
    });

    const latestHumanNarrative = data.narratives.find((item) =>
      ["PROCESSOR", "QC", "MEDICAL_REVIEW", "FINAL"].includes(
        display(item.narrativeStage ?? item.narrative_stage, ""),
      ),
    );
    setNarrativeText(
      latestHumanNarrative
        ? display(
            latestHumanNarrative.narrativeText ??
              latestHumanNarrative.narrative_text,
            "",
          )
        : "",
    );

    const products = Array.isArray(payload.products)
      ? (payload.products as Array<Record<string, unknown>>)
      : [];
    const events = Array.isArray(payload.events)
      ? (payload.events as Array<Record<string, unknown>>)
      : [];
    setAssessment((current) => ({
      ...current,
      productKey:
        current.productKey || display(products[0]?.productKey, ""),
      eventKey: current.eventKey || display(events[0]?.eventKey, ""),
    }));
  }, []);

  const load = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch(`/api/safety/cases/${caseId}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load case workspace.");
      }
      hydrate(payload.data as Workspace);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load case.");
    }
  }, [caseId, hydrate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const loadReleaseArtifacts = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/evidence`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load release artifacts.");
      }
      setReleaseArtifacts({
        evidencePackages: Array.isArray(payload.data?.evidencePackages)
          ? payload.data.evidencePackages
          : [],
        exports: Array.isArray(payload.data?.exports)
          ? payload.data.exports
          : [],
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load release artifacts.",
      );
    }
  }, [caseId]);

  useEffect(() => {
    if (tab !== "Evidence & Export") return;
    const timer = window.setTimeout(() => void loadReleaseArtifacts(), 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadReleaseArtifacts]);


  const draftPayload = workspace?.draft.payload as
    | Record<string, unknown>
    | undefined;
  const products = Array.isArray(draftPayload?.products)
    ? (draftPayload?.products as Array<Record<string, unknown>>)
    : [];
  const events = Array.isArray(draftPayload?.events)
    ? (draftPayload?.events as Array<Record<string, unknown>>)
    : [];
  const currentStatus = display(workspace?.safetyCase.case_status, "—");
  const isFinal = ["FINAL", "FINALIZED", "CLOSED", "SUBMITTED"].includes(
    currentStatus,
  );

  const openQueries = useMemo(
    () =>
      (workspace?.queries ?? []).filter(
        (item) => display(item.status) === "OPEN",
      ),
    [workspace],
  );

  async function refreshAfter(response: Response, successMessage: string) {
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "The requested case action failed.");
    }
    if (payload.data?.draft) {
      hydrate(payload.data as Workspace);
    } else {
      await load();
    }
    setMessage(successMessage);
  }

  async function saveDraft() {
    if (!workspace) return;
    setBusy("save");
    setMessage("");
    try {
      const draft = {
        identification: parseJson(editors.General, "General"),
        reporters: parseJson(editors.Reporter, "Reporter"),
        patient: parseJson(editors.Patient, "Patient"),
        events: parseJson(editors.Events, "Events"),
        products: parseJson(editors.Products, "Products"),
        medicalHistory: parseJson(editors["Medical History"], "Medical History"),
        tests: parseJson(editors.Labs, "Labs"),
        additionalInformation: parseJson(editors.Additional, "Additional information"),
      };
      const response = await fetch(`/api/safety/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, changeReason }),
      });
      await refreshAfter(response, "Case draft revision saved and audited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save draft.");
    } finally {
      setBusy("");
    }
  }

  async function assignToMe() {
    setBusy("assign");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/assignment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignedTo: "SELF",
            changeReason: "Processor accepted ownership of the safety case.",
          }),
        },
      );
      await refreshAfter(response, "Case assigned.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assignment failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveAssessment() {
    setBusy("assessment");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/assessments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(assessment),
        },
      );
      await refreshAfter(response, "Human assessment recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assessment failed.");
    } finally {
      setBusy("");
    }
  }

  async function narrative(action: "GENERATE" | "SAVE") {
    setBusy("narrative");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/narratives`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "GENERATE"
              ? {
                  action: "GENERATE_SYSTEM_DRAFT",
                  changeReason:
                    "Processor requested a deterministic narrative draft from structured case facts.",
                }
              : {
                  narrativeStage: "PROCESSOR",
                  narrativeText,
                  changeReason:
                    "Processor reviewed and saved the case narrative as a human version.",
                },
          ),
        },
      );
      await refreshAfter(
        response,
        action === "GENERATE"
          ? "System narrative draft generated. Review and save a PROCESSOR version before QC."
          : "Processor narrative version saved.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Narrative action failed.");
    } finally {
      setBusy("");
    }
  }

  async function submitQc() {
    setBusy("submit-qc");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/submit-qc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: reviewComment }),
        },
      );
      await refreshAfter(response, "Case submitted to QC.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "QC submission failed.");
    } finally {
      setBusy("");
    }
  }

  async function review(
    type: "qc" | "medical",
    action: "APPROVE" | "RETURN" | "QUERY" | "COMMENT",
  ) {
    setBusy(`${type}-${action}`);
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/reviews/${type}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comments: reviewComment,
            fieldPath: fieldPath || undefined,
            queryText: action === "QUERY" ? queryText : undefined,
          }),
        },
      );
      await refreshAfter(response, `${type.toUpperCase()} action recorded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setBusy("");
    }
  }

  async function resolveQuery(queryId: string) {
    const responseText = queryResponses[queryId]?.trim();
    if (!responseText) {
      setMessage("Enter a query response before resolving.");
      return;
    }
    setBusy(`query-${queryId}`);
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/queries/${queryId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responseText }),
        },
      );
      await refreshAfter(response, "Review query resolved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Query resolution failed.");
    } finally {
      setBusy("");
    }
  }

  async function checkFinalization() {
    setBusy("check");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/finalization`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Finalization check failed.");
      }
      setFinalization(payload.data);
      setMessage(
        payload.data.ready
          ? "All finalization checks passed."
          : "Finalization remains blocked by failed checks.",
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finalization check failed.");
    } finally {
      setBusy("");
    }
  }

  async function finalize() {
    setBusy("finalize");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/finalization`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason:
              "Authorized finalizer confirmed the reviewed case for immutable finalization.",
          }),
        },
      );
      await refreshAfter(response, "Safety case finalized into an immutable case version.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Finalization failed.");
    } finally {
      setBusy("");
    }
  }

  async function generateEvidence() {
    setBusy("evidence");
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/evidence`,
        { method: "POST" },
      );
      await refreshAfter(response, "Case Evidence Package generated.");
      await loadReleaseArtifacts();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Evidence generation failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function generateExport(
    format:
      | "NEXUS_CASE_JSON"
      | "E2B_R3_MAPPING_JSON"
      | "HUMAN_READABLE_HTML",
  ) {
    setBusy(`export-${format}`);
    try {
      const response = await fetch(
        `/api/safety/cases/${caseId}/exports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Case export generation failed.");
      }
      await loadReleaseArtifacts();
      setMessage(`${format.replaceAll("_", " ")} generated.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Case export generation failed.",
      );
    } finally {
      setBusy("");
    }
  }

  if (!workspace) {
    return (
      <main className="app-shell" id="main-content">
        <Navigation />
        <div className={styles.loading}>{message || "Loading case workspace…"}</div>
      </main>
    );
  }

  return (
    <main className="app-shell" id="main-content">
      <Navigation />

      <section className={styles.hero}>
        <div>
          <span>Nexus L2A Case Processing</span>
          <h1>{display(workspace.safetyCase.case_key)}</h1>
          <p>
            Draft R{workspace.draft.revision} · immutable final version V
            {display(workspace.safetyCase.current_version, "0")} · source{" "}
            {display(workspace.source.source_type)}
          </p>
        </div>
        <div className={styles.heroActions}>
          <Link href="/cases">Case Worklist</Link>
          <button type="button" onClick={() => void load()}>Refresh</button>
          {!isFinal ? (
            <button type="button" onClick={() => void assignToMe()} disabled={busy !== ""}>
              Assign to me
            </button>
          ) : null}
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.summary}>
        <Summary label="Status" value={currentStatus} />
        <Summary label="Priority" value={display(workspace.intake.priority)} />
        <Summary label="Seriousness" value={display(workspace.safetyCase.seriousness_status)} />
        <Summary label="Draft revision" value={`R${workspace.draft.revision}`} />
        <Summary label="Case version" value={`V${display(workspace.safetyCase.current_version, "0")}`} />
        <Summary label="Open queries" value={String(openQueries.length)} />
      </section>

      <nav className={styles.tabs} aria-label="Case workspace tabs">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? styles.activeTab : ""}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className={styles.panel}>
        {["General","Reporter","Patient","Events","Products","Medical History","Labs"].includes(tab) ? (
          <JsonEditor
            title={tab}
            value={editors[tab] ?? ""}
            onChange={(value) => setEditors((current) => ({ ...current, [tab]: value }))}
            disabled={isFinal}
          />
        ) : null}

        {tab === "Assessments" ? (
          <div className={styles.stack}>
            <div className={styles.formGrid}>
              <label>
                <span>Product</span>
                <select
                  value={assessment.productKey}
                  onChange={(e) => setAssessment((c) => ({ ...c, productKey: e.target.value }))}
                >
                  {products.map((p) => (
                    <option key={display(p.productKey)} value={display(p.productKey)}>
                      {display(p.reportedName)} · {display(p.productKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Event</span>
                <select
                  value={assessment.eventKey}
                  onChange={(e) => setAssessment((c) => ({ ...c, eventKey: e.target.value }))}
                >
                  {events.map((event) => (
                    <option key={display(event.eventKey)} value={display(event.eventKey)}>
                      {display(event.reportedTerm)} · {display(event.eventKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Assessment</span>
                <select
                  value={assessment.assessmentType}
                  onChange={(e) => setAssessment((c) => ({ ...c, assessmentType: e.target.value }))}
                >
                  {["COMPANY_CAUSALITY","REPORTER_CAUSALITY","CAUSALITY","EXPECTEDNESS","LISTEDNESS","SERIOUSNESS_SUPPORT"].map((v) => (
                    <option key={v} value={v}>{v.replaceAll("_"," ")}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Result</span>
                <input
                  value={assessment.result}
                  onChange={(e) => setAssessment((c) => ({ ...c, result: e.target.value }))}
                  placeholder="e.g. Related / Not related / Expected / Unlisted"
                />
              </label>
            </div>
            <label className={styles.full}>
              <span>Rationale</span>
              <textarea
                value={assessment.rationale}
                onChange={(e) => setAssessment((c) => ({ ...c, rationale: e.target.value }))}
              />
            </label>
            <button className={styles.primary} type="button" onClick={() => void saveAssessment()} disabled={busy !== "" || isFinal}>
              Record human assessment
            </button>
            <DataCards records={workspace.assessments} empty="No case assessments recorded yet." />
          </div>
        ) : null}

        {tab === "Narrative" ? (
          <div className={styles.stack}>
            <div className={styles.actionRow}>
              <button type="button" onClick={() => void narrative("GENERATE")} disabled={busy !== "" || isFinal}>
                Generate deterministic draft
              </button>
              <button className={styles.primary} type="button" onClick={() => void narrative("SAVE")} disabled={busy !== "" || isFinal}>
                Save human PROCESSOR version
              </button>
            </div>
            <textarea
              className={styles.narrative}
              value={narrativeText}
              onChange={(e) => setNarrativeText(e.target.value)}
              placeholder="Human-reviewed case narrative…"
              disabled={isFinal}
            />
            <DataCards records={workspace.narratives} empty="No narrative versions." />
          </div>
        ) : null}

        {tab === "Attachments" ? (
          <DataCards records={workspace.sourceDocuments} empty="No source documents linked." />
        ) : null}

        {tab === "Reviews" ? (
          <div className={styles.stack}>
            <section className={styles.reviewBox}>
              <h3>Processor → QC</h3>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
              <button className={styles.primary} type="button" onClick={() => void submitQc()} disabled={busy !== "" || isFinal}>
                Submit case to QC
              </button>
            </section>

            <section className={styles.reviewBox}>
              <h3>QC Review</h3>
              <div className={styles.formGrid}>
                <label><span>Field path</span><input value={fieldPath} onChange={(e)=>setFieldPath(e.target.value)} placeholder="events[0].reportedTerm" /></label>
                <label><span>Query text</span><input value={queryText} onChange={(e)=>setQueryText(e.target.value)} /></label>
              </div>
              <div className={styles.actionRow}>
                {["APPROVE","RETURN","QUERY","COMMENT"].map((action) => (
                  <button key={action} type="button" onClick={() => void review("qc", action as "APPROVE"|"RETURN"|"QUERY"|"COMMENT")} disabled={busy !== "" || isFinal}>
                    QC {action}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.reviewBox}>
              <h3>Medical Review</h3>
              <div className={styles.actionRow}>
                {["APPROVE","RETURN","QUERY","COMMENT"].map((action) => (
                  <button key={action} type="button" onClick={() => void review("medical", action as "APPROVE"|"RETURN"|"QUERY"|"COMMENT")} disabled={busy !== "" || isFinal}>
                    MR {action}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.reviewBox}>
              <h3>Open Queries</h3>
              {openQueries.map((query) => {
                const queryId = display(query.id);
                return (
                  <div className={styles.query} key={queryId}>
                    <strong>{display(query.review_type)} · {display(query.field_path)}</strong>
                    <p>{display(query.query_text)}</p>
                    <textarea
                      value={queryResponses[queryId] ?? ""}
                      onChange={(e) => setQueryResponses((c) => ({ ...c, [queryId]: e.target.value }))}
                      placeholder="Processor response…"
                    />
                    <button type="button" onClick={() => void resolveQuery(queryId)} disabled={busy !== ""}>
                      Resolve query
                    </button>
                  </div>
                );
              })}
              {!openQueries.length ? <p className={styles.muted}>No open queries.</p> : null}
            </section>

            <section className={styles.reviewBox}>
              <h3>Finalization</h3>
              <div className={styles.actionRow}>
                <button type="button" onClick={() => void checkFinalization()} disabled={busy !== ""}>
                  Run pre-finalization checks
                </button>
                <button className={styles.finalize} type="button" onClick={() => void finalize()} disabled={busy !== "" || isFinal || !finalization?.ready}>
                  Finalize immutable case
                </button>
              </div>
              {finalization ? (
                <div className={styles.checks}>
                  {finalization.checks.map((check) => (
                    <div key={check.key} className={check.passed ? styles.pass : styles.fail}>
                      <strong>{check.passed ? "PASS" : "BLOCK"}</strong>
                      <span>{check.key.replaceAll("_"," ")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <h3>Review History</h3>
            <DataCards records={workspace.reviewActions} empty="No review actions yet." />
          </div>
        ) : null}

        {tab === "Evidence & Export" ? (
          <div className={styles.stack}>
            <section className={styles.reviewBox}>
              <h3>Case Evidence Package</h3>
              <p className={styles.muted}>
                Generates a hash-locked package containing source/Intake lineage,
                draft history, human assessments, QC/MR actions, finalization checks
                and the immutable final case version. Raw uploaded file bytes are not embedded.
              </p>
              <button
                className={styles.primary}
                type="button"
                onClick={() => void generateEvidence()}
                disabled={busy !== "" || !isFinal}
              >
                Generate Case Evidence Package
              </button>
            </section>

            <section className={styles.reviewBox}>
              <h3>Controlled Exports</h3>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  onClick={() => void generateExport("NEXUS_CASE_JSON")}
                  disabled={busy !== "" || !isFinal}
                >
                  Generate Nexus JSON
                </button>
                <button
                  type="button"
                  onClick={() => void generateExport("E2B_R3_MAPPING_JSON")}
                  disabled={busy !== "" || !isFinal}
                >
                  Generate E2B(R3) Mapping JSON
                </button>
                <button
                  type="button"
                  onClick={() => void generateExport("HUMAN_READABLE_HTML")}
                  disabled={busy !== "" || !isFinal}
                >
                  Generate Human-readable Report
                </button>
              </div>
              <p className={styles.muted}>
                E2B(R3) mapping JSON is an internal structured representation, not
                regulatory XML transmission and not a gateway acknowledgement workflow.
              </p>
            </section>

            <section className={styles.reviewBox}>
              <h3>Evidence Packages</h3>
              {releaseArtifacts.evidencePackages.map((item) => (
                <div className={styles.query} key={display(item.id)}>
                  <strong>
                    Package v{display(item.package_version)} · {display(item.package_sha256)}
                  </strong>
                  <p>{display(item.generated_at)}</p>
                  <a
                    href={`/api/safety/cases/${caseId}/evidence/${display(item.id)}`}
                  >
                    Download evidence JSON
                  </a>
                </div>
              ))}
              {!releaseArtifacts.evidencePackages.length ? (
                <p className={styles.muted}>No case evidence package generated yet.</p>
              ) : null}
            </section>

            <section className={styles.reviewBox}>
              <h3>Exports</h3>
              {releaseArtifacts.exports.map((item) => (
                <div className={styles.query} key={display(item.id)}>
                  <strong>
                    {display(item.export_format).replaceAll("_", " ")} · v
                    {display(item.export_version)}
                  </strong>
                  <p>SHA-256: {display(item.content_sha256)}</p>
                  <a
                    href={`/api/safety/cases/${caseId}/exports/${display(item.id)}`}
                  >
                    Download export
                  </a>
                </div>
              ))}
              {!releaseArtifacts.exports.length ? (
                <p className={styles.muted}>No exports generated yet.</p>
              ) : null}
            </section>
          </div>
        ) : null}

        {tab === "Audit" ? (
          <div className={styles.stack}>
            <h3>Audit Events</h3>
            <DataCards records={workspace.auditEvents} empty="No case audit events found." />
            <h3>Immutable Case Versions</h3>
            <DataCards records={workspace.caseVersions} empty="No finalized case versions yet." />
            <h3>Follow-up Links</h3>
            <DataCards records={workspace.followUps} empty="No follow-up Intake linked." />
          </div>
        ) : null}
      </section>

      {["General","Reporter","Patient","Events","Products","Medical History","Labs"].includes(tab) && !isFinal ? (
        <section className={styles.saveBar}>
          <label>
            <span>Change reason</span>
            <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
          </label>
          <button className={styles.primary} type="button" onClick={() => void saveDraft()} disabled={busy !== ""}>
            {busy === "save" ? "Saving…" : "Save new case draft revision"}
          </button>
        </section>
      ) : null}

      <section className={styles.assist}>
        <div>
          <span>Assistive layer</span>
          <h2>Current Draft Suggestions</h2>
          <p>Suggestions do not alter the regulated case until a human acts.</p>
        </div>
        <DataCards records={workspace.assistSuggestions} empty="No assist suggestions for this revision." />
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value.replaceAll("_"," ")}</strong></div>;
}

function JsonEditor({
  title,
  value,
  onChange,
  disabled,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={styles.stack}>
      <div>
        <span className={styles.kicker}>Case-owned draft</span>
        <h2>{title}</h2>
      </div>
      <textarea
        className={styles.jsonEditor}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <p className={styles.muted}>
        This editor writes a new immutable case-draft revision; it does not alter the original Intake evidence.
      </p>
    </div>
  );
}

function DataCards({
  records,
  empty,
}: {
  records: Array<Record<string, unknown>>;
  empty: string;
}) {
  if (!records.length) return <p className={styles.muted}>{empty}</p>;
  return (
    <div className={styles.cards}>
      {records.map((item, index) => (
        <pre key={display(item.id, String(index))}>{json(item)}</pre>
      ))}
    </div>
  );
}
