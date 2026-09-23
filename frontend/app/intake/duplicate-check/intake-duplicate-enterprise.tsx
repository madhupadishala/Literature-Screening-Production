"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./intake-duplicate-enterprise.module.css";

type IntakeRow = {
  intakeRecordId: string;
  intakeKey: string;
  sourceType: string;
  sourceSystem: string;
  priority: string;
  sourceReviewStatus: string;
  duplicateReviewStatus: string;
  caseRelationship: string | null;
  triageStatus: string;
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
  candidateCaseId: string | null;
  candidateReference: string;
  score: number;
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  humanCandidateDecision: string;
  candidateSnapshot: {
    intakeKey?: string;
    caseKey?: string | null;
    externalReference?: string | null;
    products?: Array<{ reportedName?: string }>;
    events?: Array<{ reportedTerm?: string }>;
    patients?: Array<{
      patientReference?: string | null;
      sex?: string | null;
      ageValue?: number | null;
      ageUnit?: string | null;
    }>;
  };
};

type DuplicateWorkspace = {
  latestRun: { runNumber: number } | null;
  candidates: Candidate[];
  latestAssessment: {
    assessmentVersion: number;
    humanDecision: string;
    selectedCandidateId: string | null;
  } | null;
};

type ReviewTaskPayload = { data?: { records?: unknown[] } };

function first(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function dateValue(value: unknown, withTime = false): string {
  if (typeof value !== "string" || !value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return withTime
    ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

export default function IntakeDuplicateEnterprise() {
  const [records, setRecords] = useState<IntakeRow[]>([]);
  const [selectedIntakeId, setSelectedIntakeId] = useState("");
  const [workspace, setWorkspace] = useState<IntakeWorkspace | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateWorkspace | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [qcCount, setQcCount] = useState(0);
  const [mrCount, setMrCount] = useState(0);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [expandedSearch, setExpandedSearch] = useState(false);
  const [rationale, setRationale] = useState("Reviewer performed the mandatory duplicate and follow-up check before Intake & Triage.");

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
      if (!intakeResponse.ok || !intakePayload?.success) throw new Error(intakePayload?.error || "Unable to load Intake records.");
      const rows = Array.isArray(intakePayload.data?.records) ? (intakePayload.data.records as IntakeRow[]) : [];
      setRecords(rows);
      setQcCount(Array.isArray(qcPayload.data?.records) ? qcPayload.data!.records!.length : 0);
      setMrCount(Array.isArray(mrPayload.data?.records) ? mrPayload.data!.records!.length : 0);
      const eligible = rows.filter((r) => r.sourceReviewStatus === "VERIFIED" && r.duplicateReviewStatus !== "COMPLETE");
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
    try {
      const [workspaceResponse, duplicateResponse] = await Promise.all([
        fetch(`/api/safety/intake/${intakeId}`, { cache: "no-store" }),
        fetch(`/api/safety/intake/${intakeId}/duplicate-review`, { cache: "no-store" }),
      ]);
      const workspacePayload = await workspaceResponse.json();
      const duplicatePayload = await duplicateResponse.json();
      if (!workspaceResponse.ok || !workspacePayload?.success) throw new Error(workspacePayload?.error || "Unable to load booked Intake data.");
      if (!duplicateResponse.ok || !duplicatePayload?.success) throw new Error(duplicatePayload?.error || "Unable to load duplicate review.");
      setWorkspace(workspacePayload.data as IntakeWorkspace);
      setDuplicate(duplicatePayload.data as DuplicateWorkspace);
      setSelectedCandidateId(duplicatePayload.data?.latestAssessment?.selectedCandidateId || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load duplicate workspace.");
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void loadQueues(), 0);
    return () => window.clearTimeout(t);
  }, [loadQueues]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadSelected(selectedIntakeId), 0);
    return () => window.clearTimeout(t);
  }, [loadSelected, selectedIntakeId]);

  const eligibleRecords = useMemo(
    () => records.filter((r) => r.sourceReviewStatus === "VERIFIED" && r.duplicateReviewStatus !== "COMPLETE"),
    [records],
  );

  const bookingCount = records.filter((r) => r.sourceReviewStatus !== "VERIFIED").length;
  const triageCount = records.filter((r) => r.duplicateReviewStatus === "COMPLETE" && r.caseRelationship !== "DUPLICATE" && r.triageStatus !== "COMPLETE").length;

  const intake = workspace?.intake;
  const source = workspace?.source;
  const patient = workspace?.patients?.[0];
  const reporter = workspace?.reporters?.[0];
  const product = workspace?.products?.[0];
  const event = workspace?.events?.[0];
  const sourcePayload = source?.payload && typeof source.payload === "object" && !Array.isArray(source.payload)
    ? (source.payload as Record<string, unknown>)
    : undefined;

  const selectedCandidate = duplicate?.candidates.find((c) => c.id === selectedCandidateId);
  const finalized = Boolean(duplicate?.latestAssessment);

  async function runSearch() {
    if (!selectedIntakeId) return;
    setBusy("search");
    setMessage("");
    try {
      const response = await fetch(`/api/safety/intake/${selectedIntakeId}/duplicate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rationale, expandedSearch }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Duplicate search failed.");
      setDuplicate(payload.data as DuplicateWorkspace);
      setSelectedCandidateId("");
      setMessage("Duplicate search completed. Review ranked matches and make the human relationship decision.");
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
        body: JSON.stringify({ humanDecision: decision, selectedCandidateId: selectedCandidateId || null, rationale }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to finalize duplicate gate.");
      setDuplicate(payload.data as DuplicateWorkspace);
      setMessage(
        decision === "DUPLICATE"
          ? "Duplicate confirmed. No new Intake lifecycle will be created."
          : decision === "FOLLOW_UP"
            ? "Follow-up linked to the existing case as a new follow-up."
            : "No duplicate confirmed. The report can continue to formal Intake & Triage.",
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

  const initialReceipt = dateValue(source?.receivedAt ?? source?.received_at, true);
  const centralReceipt = dateValue(first(intake, ["created_at", "createdAt", "central_receipt_date", "centralReceiptDate"]), true);
  const country = first(intake, ["country_code", "countryCode"]);
  const reportType = first(source, ["sourceType", "source_type"]);
  const projectId = first(sourcePayload, ["projectId", "project_id", "projectNumber", "project_number"]);
  const studyId = first(sourcePayload, ["studyId", "study_id", "studyNumber", "study_number"]);
  const centerId = first(sourcePayload, ["centerId", "center_id", "centreId", "centre_id"]);
  const initialJustification = first(sourcePayload, ["initialJustification", "initial_justification", "justification"]);
  const productName = first(product, ["reported_name", "reportedName", "product_name", "productName"]);
  const genericName = first(product, ["generic_name", "genericName", "active_ingredient", "activeIngredient"]);
  const descriptionAsReported = first(event, ["description_as_reported", "descriptionAsReported", "reported_term", "reportedTerm"]);
  const onsetDateTime = dateValue(first(event, ["onset_datetime", "onsetDateTime", "onset_date", "onsetDate"]), true);

  const reporterSalutation = first(reporter, ["salutation", "title"]);
  const reporterFirstName = first(reporter, ["first_name", "firstName", "given_name", "givenName"]);
  const reporterMiddleName = first(reporter, ["middle_name", "middleName"]);
  const reporterLastName = first(reporter, ["last_name", "lastName", "family_name", "familyName"]);
  const reporterSuffix = first(reporter, ["suffix"]);
  const reporterInstitution = first(reporter, ["institution", "organisation", "organization"]);
  const reporterDepartment = first(reporter, ["department"]);
  const reporterCountry = first(reporter, ["country", "country_code", "countryCode"]);
  const reporterState = first(reporter, ["state_province", "stateProvince", "state"]);
  const reporterPostal = first(reporter, ["postal_code", "postalCode", "zip"]);
  const intermediary = first(reporter, ["intermediary", "intermediary_name", "intermediaryName"]);

  const patientNameOrInitials = [
    first(patient, ["first_name", "firstName", "given_name", "givenName"]),
    first(patient, ["last_name", "lastName", "family_name", "familyName"]),
  ].filter(Boolean).join(" ") || first(patient, ["initials", "patient_initials"]);
  const patientId = first(patient, ["patient_reference", "patientReference", "patient_id", "patientId"]);
  const dob = dateValue(first(patient, ["date_of_birth", "dateOfBirth", "dob"]));
  const age = first(patient, ["age_value", "ageValue", "age"]);
  const ageUnits = first(patient, ["age_unit", "ageUnit"]);
  const gender = first(patient, ["sex", "gender"]);

  const literatureId = first(sourcePayload, ["literatureId", "literature_id", "pmid", "doi", "referenceId", "reference_id"]);
  const keywords = first(sourcePayload, ["keywords", "keyword"]);
  const journal = first(sourcePayload, ["journal", "journalName", "journal_name"]);
  const title = first(sourcePayload, ["title", "articleTitle", "article_title"]);

  return (
    <main className={styles.workspace} id="main-content">
      <section className={styles.headline}>
        <div>
          <h1>Duplicate &amp; Follow-up Check</h1>
          <p>Complete governed search criteria before a report enters Intake &amp; Triage.</p>
        </div>
        <div className={styles.metrics}>
          <Metric label="Booking Queue" value={bookingCount} tone="blue" />
          <Metric label="Triage Queue" value={triageCount} tone="teal" />
          <Metric label="QC Queue" value={qcCount} tone="purple" />
          <Metric label="MR Queue" value={mrCount} tone="warn" />
        </div>
      </section>

      {message ? <div className={styles.message}>{message}</div> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Case Search Criteria</h2>
          <div className={styles.recordPicker}>
            <label htmlFor="booked-intake">Booked Intake</label>
            <select id="booked-intake" value={selectedIntakeId} onChange={(e) => setSelectedIntakeId(e.target.value)}>
              <option value="">Select verified Intake…</option>
              {eligibleRecords.map((row) => (
                <option key={row.intakeRecordId} value={row.intakeRecordId}>{row.intakeKey} · {human(row.sourceType)} · {human(row.priority)}</option>
              ))}
            </select>
          </div>
          <span className={styles.hint}>Values are sourced from the governed booked Intake record.</span>
        </div>

        <div className={styles.criteria}>
          <CriteriaSection title="General">
            <Field label="Initial Receipt Date" value={initialReceipt} required />
            <Field label="Central Receipt Date" value={centralReceipt} />
            <Field label="Country" value={country} required />
            <Field label="Report Type" value={reportType} required />
            <Field label="Project ID" value={projectId} />
            <Field label="Study ID" value={studyId} />
            <Field label="Center ID" value={centerId} />
            <Field label="Initial Justification" value={initialJustification} />
            <Field label="Product Name" value={productName} required />
            <Field label="Generic Name" value={genericName} />
            <Field label="Description as Reported" value={descriptionAsReported} wide required />
            <Field label="Onset Date / Time" value={onsetDateTime} />
          </CriteriaSection>

          <CriteriaSection title="Reporter">
            <Field label="Salutation" value={reporterSalutation} small />
            <Field label="First Name" value={reporterFirstName} />
            <Field label="Middle Name" value={reporterMiddleName} />
            <Field label="Last Name" value={reporterLastName} />
            <Field label="Suffix" value={reporterSuffix} small />
            <Field label="Institution" value={reporterInstitution} wide />
            <Field label="Department" value={reporterDepartment} />
            <Field label="Country" value={reporterCountry} />
            <Field label="State / Province" value={reporterState} />
            <Field label="Postal Code" value={reporterPostal} />
            <Field label="Intermediary" value={intermediary} wide />
          </CriteriaSection>

          <CriteriaSection title="Patient">
            <Field label="First / Last Name or Initials" value={patientNameOrInitials} wide />
            <Field label="Patient ID" value={patientId} />
            <Field label="Date of Birth" value={dob} />
            <Field label="Age" value={age} small />
            <Field label="Units" value={ageUnits} small />
            <Field label="Gender" value={gender} small />
          </CriteriaSection>

          <CriteriaSection title="Literature Reference">
            <Field label="Reference ID / PMID / DOI" value={literatureId} />
            <Field label="Keywords" value={keywords} />
            <Field label="Journal" value={journal} />
            <Field label="Title" value={title} wide />
          </CriteriaSection>
        </div>

        <div className={styles.searchOptions}>
          <label>
            <input type="checkbox" checked={expandedSearch} onChange={(e) => setExpandedSearch(e.target.checked)} />
            <span>Expanded similarity search (partial / phonetic matching where supported)</span>
          </label>
        </div>

        <div className={styles.auditRow}>
          <label>
            <span>Audit rationale</span>
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={() => void runSearch()} disabled={!selectedIntakeId || busy !== "" || finalized}>{busy === "search" ? "Searching…" : "Search Matches"}</button>
          <button onClick={clearSelection} disabled={busy !== ""}>Clear</button>
          <button className={styles.follow} onClick={() => void finalize("FOLLOW_UP")} disabled={!selectedCandidate || !duplicate?.latestRun || busy !== "" || finalized}>Link as Follow-up</button>
          <button onClick={() => void finalize("NEW_CASE")} disabled={!duplicate?.latestRun || busy !== "" || finalized}>Continue as New Record</button>
          <button className={styles.danger} onClick={() => void finalize("DUPLICATE")} disabled={!selectedCandidate || !duplicate?.latestRun || busy !== "" || finalized}>Confirm Duplicate</button>
          {finalized && duplicate?.latestAssessment?.humanDecision !== "DUPLICATE" && selectedIntakeId ? (
            <Link className={styles.next} href={`/intake/${selectedIntakeId}/triage`}>Open Triage →</Link>
          ) : null}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.tableBar}>
          <h3>Potential Matches ({duplicate?.candidates.length ?? 0})</h3>
          <div className={styles.grow} />
          <span className={styles.gateState}>{duplicate?.latestAssessment ? `Final: ${human(duplicate.latestAssessment.humanDecision)}` : duplicate?.latestRun ? `Run ${duplicate.latestRun.runNumber} · human decision required` : "Run search to generate ranked candidates"}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Select</th><th>Match Score</th><th>Existing Case Number</th><th>Patient</th><th>Product</th><th>Event</th><th>Source</th><th>Recommendation</th><th>Action</th></tr></thead>
            <tbody>
              {duplicate?.candidates.map((candidate) => {
                const p = candidate.candidateSnapshot.patients?.[0];
                const patientText = p ? [p.patientReference, p.ageValue != null ? `${p.ageValue}${p.ageUnit ? ` ${p.ageUnit}` : ""}` : null, p.sex].filter(Boolean).join(" · ") : "—";
                const rec = recommendation(candidate);
                return (
                  <tr key={candidate.id} className={selectedCandidateId === candidate.id ? styles.selectedRow : undefined}>
                    <td><input type="radio" name="candidate" checked={selectedCandidateId === candidate.id} onChange={() => setSelectedCandidateId(candidate.id)} disabled={finalized} /></td>
                    <td><span className={`${styles.match} ${candidate.confidenceBand === "HIGH" ? styles.matchHigh : candidate.confidenceBand === "MEDIUM" ? styles.matchMid : styles.matchLow}`}>{Math.round(candidate.score)}%</span></td>
                    <td className={styles.caseNumber}>{candidate.candidateSnapshot.caseKey || candidate.candidateReference}</td>
                    <td>{patientText}</td>
                    <td>{candidate.candidateSnapshot.products?.map((x) => x.reportedName).filter(Boolean).join(", ") || "—"}</td>
                    <td>{candidate.candidateSnapshot.events?.map((x) => x.reportedTerm).filter(Boolean).join(", ") || "—"}</td>
                    <td>{candidate.candidateSnapshot.externalReference || candidate.candidateSnapshot.intakeKey || "Existing safety record"}</td>
                    <td><span className={`${styles.recommendation} ${rec.includes("Duplicate") ? styles.duplicate : rec.includes("Follow") ? styles.followup : styles.noMatch}`}>{rec}</span></td>
                    <td>{candidate.candidateCaseId ? <Link href={`/cases/${candidate.candidateCaseId}`}>View Case</Link> : "Intake match"}</td>
                  </tr>
                );
              })}
              {!duplicate?.candidates.length ? <tr><td colSpan={9} className={styles.empty}>{selectedIntakeId ? duplicate?.latestRun ? "No candidate met the configured duplicate-review threshold." : "Search has not been run for this booked Intake." : "Select a verified Intake record to begin the mandatory duplicate check."}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className={styles.footer}><span>Showing {duplicate?.candidates.length ?? 0} ranked matches</span><span>Human decision is authoritative · evidence remains auditable</span></div>
      </section>

      {finalized && duplicate?.latestAssessment ? <section className={styles.finalized}><strong>Duplicate gate finalized:</strong> {human(duplicate.latestAssessment.humanDecision)} · assessment version {duplicate.latestAssessment.assessmentVersion}</section> : null}
      <div className={styles.bottomNote}><span>Duplicate search is mandatory before formal Intake &amp; Triage.</span><span>Follow-up received → duplicate check → if not duplicate, link to existing case as a new follow-up.</span></div>
    </main>
  );
}

function CriteriaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.section}><div className={styles.sectionTitle}>{title}</div><div className={styles.grid}>{children}</div></section>;
}

function Field({ label, value, wide = false, small = false, required = false }: { label: string; value: string; wide?: boolean; small?: boolean; required?: boolean }) {
  const cls = `${styles.field} ${wide ? styles.wide : ""} ${small ? styles.small : ""}`;
  return <div className={cls}><label>{label}{required ? <span className={styles.required}>*</span> : null}</label><div className={`${styles.value} ${value ? "" : styles.empty}`}>{value || "Not captured"}</div></div>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "blue" | "teal" | "purple" | "warn" }) {
  return <div className={`${styles.metric} ${styles[tone]}`}><span>{label}</span><strong>{value}</strong></div>;
}
