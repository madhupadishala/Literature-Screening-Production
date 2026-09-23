"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./intake-duplicate-workspace.module.css";

type IntakeRow = {
  intakeRecordId: string;
  intakeKey: string;
  sourceType: string;
  sourceSystem: string;
  intakeChannel: string;
  priority: string;
  countryCode: string | null;
  sourceReviewStatus: string;
  duplicateReviewStatus: string;
  caseRelationship: string | null;
  seriousnessStatus: string;
  triageStatus: string;
  updatedAt: string;
};

type IntakeWorkspace = {
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
  patients: Array<Record<string, unknown>>;
  reporters: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

type Candidate = {
  id: string;
  candidateIntakeRecordId: string;
  candidateCaseId: string | null;
  candidateReference: string;
  score: number;
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  matchedFactors: Array<{ key?: unknown; weight?: unknown; evidence?: unknown }>;
  candidateSnapshot: {
    intakeKey?: string;
    caseKey?: string | null;
    externalReference?: string | null;
    countryCode?: string | null;
    products?: Array<{ reportedName?: string }>;
    events?: Array<{ reportedTerm?: string }>;
    patients?: Array<{
      patientReference?: string | null;
      sex?: string | null;
      ageValue?: number | null;
      ageUnit?: string | null;
    }>;
  };
  rank: number;
  humanCandidateDecision: string;
};

type DuplicateWorkspace = {
  source: {
    intakeRecordId: string;
    intakeKey: string;
    caseId?: string | null;
    caseKey?: string | null;
    externalReference?: string | null;
    countryCode?: string | null;
    products: Array<{ reportedName: string }>;
    events: Array<{ reportedTerm: string }>;
  };
  latestRun: {
    id: string;
    runNumber: number;
    candidateCount: number;
    status: string;
  } | null;
  candidates: Candidate[];
  latestAssessment: {
    id: string;
    assessmentVersion: number;
    systemRecommendation: string;
    topCandidateScore: number | null;
    humanDecision: string;
    selectedCandidateId: string | null;
    selectedCandidateCaseId?: string | null;
    rationale: string;
    assessedAt: string;
  } | null;
};

type ReviewTaskPayload = {
  data?: { records?: unknown[] };
};

function first(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function dateValue(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function human(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "—";
}

function recommendation(candidate: Candidate): string {
  if (candidate.humanCandidateDecision && candidate.humanCandidateDecision !== "PENDING") {
    return human(candidate.humanCandidateDecision);
  }
  if (candidate.confidenceBand === "HIGH") return "Potential Duplicate";
  if (candidate.confidenceBand === "MEDIUM") return "Potential Follow-up";
  return "Low Match";
}

export default function IntakeDuplicateWorkspace() {
  const [records, setRecords] = useState<IntakeRow[]>([]);
  const [selectedIntakeId, setSelectedIntakeId] = useState("");
  const [workspace, setWorkspace] = useState<IntakeWorkspace | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateWorkspace | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [qcCount, setQcCount] = useState(0);
  const [mrCount, setMrCount] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [rationale, setRationale] = useState(
    "Reviewer performed the mandatory duplicate and follow-up check before Intake & Triage.",
  );

  const loadQueues = useCallback(async () => {
    try {
      const [intakeResponse, qcResponse, mrResponse] = await Promise.all([
        fetch("/api/safety/intake?limit=500", { cache: "no-store" }),
        fetch("/api/safety/review-tasks?entityType=INTAKE_RECORD&taskType=QC", { cache: "no-store" }),
        fetch("/api/safety/review-tasks?entityType=INTAKE_RECORD&taskType=MEDICAL_REVIEW", { cache: "no-store" }),
      ]);
      const intakePayload = await intakeResponse.json();
      const qcPayload = (await qcResponse.json()) as ReviewTaskPayload;
      const mrPayload = (await mrResponse.json()) as ReviewTaskPayload;
      if (!intakeResponse.ok || !intakePayload?.success) {
        throw new Error(intakePayload?.error || "Unable to load Intake records.");
      }
      const rows = Array.isArray(intakePayload.data?.records) ? intakePayload.data.records as IntakeRow[] : [];
      setRecords(rows);
      setQcCount(Array.isArray(qcPayload.data?.records) ? qcPayload.data!.records!.length : 0);
      setMrCount(Array.isArray(mrPayload.data?.records) ? mrPayload.data!.records!.length : 0);
      const eligible = rows.filter(
        (row) => row.sourceReviewStatus === "VERIFIED" && row.duplicateReviewStatus !== "COMPLETE",
      );
      setSelectedIntakeId((current) => current || eligible[0]?.intakeRecordId || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Intake queues.");
    }
  }, []);

  const loadSelected = useCallback(async (intakeId: string) => {
    if (!intakeId) {
      setWorkspace(null);
      setDuplicate(null);
      setSelectedCandidateId("");
      return;
    }
    setMessage("");
    try {
      const [workspaceResponse, duplicateResponse] = await Promise.all([
        fetch(`/api/safety/intake/${intakeId}`, { cache: "no-store" }),
        fetch(`/api/safety/intake/${intakeId}/duplicate-review`, { cache: "no-store" }),
      ]);
      const workspacePayload = await workspaceResponse.json();
      const duplicatePayload = await duplicateResponse.json();
      if (!workspaceResponse.ok || !workspacePayload?.success) {
        throw new Error(workspacePayload?.error || "Unable to load booked Intake data.");
      }
      if (!duplicateResponse.ok || !duplicatePayload?.success) {
        throw new Error(duplicatePayload?.error || "Unable to load duplicate-review workspace.");
      }
      setWorkspace(workspacePayload.data as IntakeWorkspace);
      setDuplicate(duplicatePayload.data as DuplicateWorkspace);
      setSelectedCandidateId(duplicatePayload.data?.latestAssessment?.selectedCandidateId || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load duplicate workspace.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueues(), 0);
    return () => window.clearTimeout(timer);
  }, [loadQueues]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSelected(selectedIntakeId), 0);
    return () => window.clearTimeout(timer);
  }, [loadSelected, selectedIntakeId]);

  const eligibleRecords = useMemo(
    () => records.filter(
      (row) => row.sourceReviewStatus === "VERIFIED" && row.duplicateReviewStatus !== "COMPLETE",
    ),
    [records],
  );

  const bookingCount = records.filter((row) => row.sourceReviewStatus !== "VERIFIED").length;
  const triageCount = records.filter(
    (row) => row.duplicateReviewStatus === "COMPLETE" && row.caseRelationship !== "DUPLICATE" && row.triageStatus !== "COMPLETE",
  ).length;

  const intake = workspace?.intake;
  const source = workspace?.source;
  const patient = workspace?.patients?.[0];
  const reporter = workspace?.reporters?.[0];
  const product = workspace?.products?.[0];
  const event = workspace?.events?.[0];
  const sourcePayload = source?.payload && typeof source.payload === "object" && !Array.isArray(source.payload)
    ? source.payload as Record<string, unknown>
    : undefined;

  const selectedRecord = records.find((row) => row.intakeRecordId === selectedIntakeId);
  const selectedCandidate = duplicate?.candidates.find((candidate) => candidate.id === selectedCandidateId);
  const finalized = Boolean(duplicate?.latestAssessment);

  async function runSearch() {
    if (!selectedIntakeId) return;
    setBusy("search");
    setMessage("");
    try {
      const response = await fetch(`/api/safety/intake/${selectedIntakeId}/duplicate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rationale }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Duplicate search failed.");
      setDuplicate(payload.data as DuplicateWorkspace);
      setSelectedCandidateId("");
      setMessage("Duplicate search completed. Review the ranked matches and make the human relationship decision.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Duplicate search failed.");
    } finally {
      setBusy("");
    }
  }

  async function finalize(decision: "NEW_CASE" | "FOLLOW_UP" | "DUPLICATE") {
    if (!selectedIntakeId || !duplicate?.latestRun) return;
    if ((decision === "FOLLOW_UP" || decision === "DUPLICATE") && !selectedCandidateId) {
      setMessage("Select an existing match before linking a follow-up or confirming a duplicate.");
      return;
    }
    setBusy(decision);
    setMessage("");
    try {
      const response = await fetch(`/api/safety/intake/${selectedIntakeId}/duplicate-review/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          humanDecision: decision,
          selectedCandidateId: selectedCandidateId || null,
          rationale,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to finalize duplicate gate.");
      setDuplicate(payload.data as DuplicateWorkspace);
      setMessage(
        decision === "DUPLICATE"
          ? "Duplicate confirmed. No new Intake lifecycle will be created for this report."
          : decision === "FOLLOW_UP"
            ? "Follow-up linked to the existing case as a new follow-up. It can now continue through the Intake & Triage lifecycle."
            : "No duplicate confirmed. The report can now continue into formal Intake & Triage.",
      );
      void loadQueues();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to finalize duplicate gate.");
    } finally {
      setBusy("");
    }
  }

  function clearSelection() {
    setSelectedIntakeId("");
    setWorkspace(null);
    setDuplicate(null);
    setSelectedCandidateId("");
    setMessage("");
  }

  return (
    <main className={styles.workspace} id="main-content">
      <section className={styles.headline}>
        <div>
          <h1>Duplicate &amp; Follow-up Check</h1>
          <p>Mandatory duplicate gate before the record enters the Intake &amp; Triage lifecycle.</p>
        </div>
        <div className={styles.metrics} aria-label="Intake lifecycle queues">
          <Metric label="Booking Queue" value={bookingCount} tone="blue" />
          <Metric label="Triage Queue" value={triageCount} tone="teal" />
          <Metric label="QC Queue" value={qcCount} tone="purple" />
          <Metric label="MR Queue" value={mrCount} tone="warn" />
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <h2>Search Criteria</h2>
          <div className={styles.recordPicker}>
            <label htmlFor="intake-record">Booked Intake</label>
            <select
              id="intake-record"
              value={selectedIntakeId}
              onChange={(event) => setSelectedIntakeId(event.target.value)}
            >
              <option value="">Select verified Intake…</option>
              {eligibleRecords.map((row) => (
                <option key={row.intakeRecordId} value={row.intakeRecordId}>
                  {row.intakeKey} · {human(row.sourceType)} · {human(row.priority)}
                </option>
              ))}
            </select>
          </div>
          <span className={styles.hint}>Search uses the governed values stored on the selected booked Intake.</span>
        </div>

        <div className={styles.form}>
          <div className={styles.grid}>
            <ReadField label="Agency" value={first(source, ["sourceSystem", "source_system"])} required />
            <ReadField label="Original Case Number" value={first(source, ["externalReference", "external_reference"])} />
            <ReadField label="Message Number" value={first(sourcePayload, ["messageNumber", "message_number", "messageId", "message_id"])} />
            <ReadField label="Receipt Date" value={dateValue(source?.receivedAt ?? source?.received_at)} small />
            <ReadField label="Report Type" value={first(source, ["sourceType", "source_type"])} small />

            <ReadField label="Product Name" value={first(product, ["reported_name", "reportedName", "product_name", "productName"])} />
            <ReadField label="Study ID" value={first(sourcePayload, ["studyId", "study_id", "studyNumber", "study_number"])} />
            <ReadField label="Country of Incidence" value={first(intake, ["country_code", "countryCode"])} />
            <ReadField label="Reporter" value={first(reporter, ["reporter_type", "reporterType", "qualification", "reporter_role"])} />

            <div className={styles.sectionBar}>Patient Details</div>
            <ReadField label="First Name" value={first(patient, ["first_name", "firstName", "given_name", "givenName"])} small />
            <ReadField label="Last Name" value={first(patient, ["last_name", "lastName", "family_name", "familyName"])} small />
            <ReadField label="Initials" value={first(patient, ["initials", "patient_initials"])} small />
            <ReadField label="Patient ID" value={first(patient, ["patient_reference", "patientReference", "patient_id", "patientId"])} />
            <ReadField label="Age" value={first(patient, ["age_value", "ageValue", "age"])} tiny />
            <ReadField label="Unit" value={first(patient, ["age_unit", "ageUnit"])} tiny />
            <ReadField label="Gender" value={first(patient, ["sex", "gender"])} tiny />

            <ReadField label="Event Description" value={first(event, ["reported_term", "reportedTerm", "event_term", "eventTerm"])} wide />
            <ReadField label="Onset Date" value={dateValue(first(event, ["onset_date", "onsetDate"]))} small />
            <ReadField label="Reference / Source" value={first(source, ["externalReference", "external_reference"])} />
            <ReadField label="Keywords / Title" value={first(sourcePayload, ["title", "articleTitle", "article_title", "keywords"])} />
          </div>
        </div>

        <div className={styles.auditRow}>
          <label>
            <span>Audit rationale</span>
            <input value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => void runSearch()} disabled={!selectedIntakeId || busy !== "" || finalized}>
            {busy === "search" ? "Searching…" : "⌕ Search Matches"}
          </button>
          <button onClick={clearSelection} disabled={busy !== ""}>↻ Clear</button>
          <button
            className={styles.link}
            onClick={() => void finalize("FOLLOW_UP")}
            disabled={!selectedCandidate || !duplicate?.latestRun || busy !== "" || finalized}
          >
            🔗 Link as Follow-up
          </button>
          <button
            onClick={() => void finalize("NEW_CASE")}
            disabled={!duplicate?.latestRun || busy !== "" || finalized}
          >
            Continue as New Record
          </button>
          <button
            className={styles.danger}
            onClick={() => void finalize("DUPLICATE")}
            disabled={!selectedCandidate || !duplicate?.latestRun || busy !== "" || finalized}
          >
            Confirm Duplicate
          </button>
          {finalized && duplicate?.latestAssessment?.humanDecision !== "DUPLICATE" && selectedIntakeId ? (
            <Link className={styles.nextLink} href={`/intake/${selectedIntakeId}/triage`}>Open Triage →</Link>
          ) : null}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.tableBar}>
          <h3>Potential Matches ({duplicate?.candidates.length ?? 0})</h3>
          <div className={styles.grow} />
          <span className={styles.gateState}>
            {duplicate?.latestAssessment
              ? `Final: ${human(duplicate.latestAssessment.humanDecision)}`
              : duplicate?.latestRun
                ? `Run ${duplicate.latestRun.runNumber} · human decision required`
                : "Run search to generate ranked candidates"}
          </span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Match Score</th>
                <th>Existing Case Number</th>
                <th>Patient</th>
                <th>Product</th>
                <th>Event</th>
                <th>Receipt Date</th>
                <th>Source</th>
                <th>Recommendation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {duplicate?.candidates.map((candidate) => {
                const patientSnapshot = candidate.candidateSnapshot.patients?.[0];
                const patientText = patientSnapshot
                  ? [
                      patientSnapshot.patientReference,
                      patientSnapshot.ageValue != null ? `${patientSnapshot.ageValue}${patientSnapshot.ageUnit ? ` ${patientSnapshot.ageUnit}` : ""}` : null,
                      patientSnapshot.sex,
                    ].filter(Boolean).join(" · ")
                  : "—";
                const rec = recommendation(candidate);
                return (
                  <tr key={candidate.id} className={selectedCandidateId === candidate.id ? styles.selectedRow : undefined}>
                    <td>
                      <input
                        type="radio"
                        name="candidate"
                        aria-label={`Select ${candidate.candidateReference}`}
                        checked={selectedCandidateId === candidate.id}
                        onChange={() => setSelectedCandidateId(candidate.id)}
                        disabled={finalized}
                      />
                    </td>
                    <td>
                      <span className={`${styles.match} ${candidate.confidenceBand === "HIGH" ? styles.matchHigh : candidate.confidenceBand === "MEDIUM" ? styles.matchMid : styles.matchLow}`}>
                        {Math.round(candidate.score)}%
                      </span>
                    </td>
                    <td className={styles.caseNumber}>{candidate.candidateSnapshot.caseKey || candidate.candidateReference}</td>
                    <td>{patientText}</td>
                    <td>{candidate.candidateSnapshot.products?.map((item) => item.reportedName).filter(Boolean).join(", ") || "—"}</td>
                    <td>{candidate.candidateSnapshot.events?.map((item) => item.reportedTerm).filter(Boolean).join(", ") || "—"}</td>
                    <td>—</td>
                    <td>{candidate.candidateSnapshot.externalReference || candidate.candidateSnapshot.intakeKey || "Existing safety record"}</td>
                    <td>
                      <span className={`${styles.recommendation} ${rec.includes("Duplicate") ? styles.duplicate : rec.includes("Follow") ? styles.followup : styles.noMatch}`}>
                        {rec}
                      </span>
                    </td>
                    <td>
                      {candidate.candidateCaseId ? (
                        <Link href={`/cases/${candidate.candidateCaseId}`}>View Case</Link>
                      ) : (
                        <span className={styles.muted}>Intake match</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!duplicate?.candidates.length ? (
                <tr>
                  <td colSpan={10} className={styles.empty}>
                    {selectedIntakeId
                      ? duplicate?.latestRun
                        ? "No candidate met the configured duplicate-review threshold."
                        : "Search has not been run for this booked Intake."
                      : "Select a verified Intake record to begin the mandatory duplicate check."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className={styles.footer}>
          <span>Showing {duplicate?.candidates.length ?? 0} ranked matches</span>
          <span>Human decision is authoritative · search evidence remains auditable</span>
        </div>
      </section>

      {finalized && duplicate?.latestAssessment ? (
        <section className={styles.finalizedNote}>
          <strong>Duplicate gate finalized:</strong> {human(duplicate.latestAssessment.humanDecision)} · assessment version {duplicate.latestAssessment.assessmentVersion}
        </section>
      ) : null}

      <div className={styles.bottomNote}>
        <span>Duplicate search is mandatory before formal Intake &amp; Triage.</span>
        <span>Follow-up received → duplicate check → if not duplicate, link to existing case as a new follow-up.</span>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "blue" | "teal" | "purple" | "warn" }) {
  return (
    <div className={`${styles.metric} ${styles[tone]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReadField({
  label,
  value,
  required = false,
  small = false,
  tiny = false,
  wide = false,
}: {
  label: string;
  value: string;
  required?: boolean;
  small?: boolean;
  tiny?: boolean;
  wide?: boolean;
}) {
  const className = `${styles.field} ${small ? styles.small : ""} ${tiny ? styles.tiny : ""} ${wide ? styles.wide : ""}`;
  return (
    <label className={className}>
      <span>{label}{required ? " *" : ""}</span>
      <input value={value} readOnly placeholder="—" />
    </label>
  );
}
