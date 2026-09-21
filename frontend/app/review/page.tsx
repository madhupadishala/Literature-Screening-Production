"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

type ReviewRecord = {
  workspaceId: string;
  packageId: string;
  packageKey: string;
  pmid: string;
  title: string;
  workflowState: string;
  workspaceStatus: string;
  patientSegmentationStatus: string;
  patientCount?: number;
  labelingStatus: string;
  causalityStatus: string;
  mrReviewStatus: string;
  products: string[];
  clinicalEvents: string[];
  screeningDecision: string;
  screeningReviewedAt?: string;
  screeningReviewedBy?: string;
};

type PatientSegment = {
  patientSegmentKey: string;
  patientLabel?: string;
  identifiablePatientStatus: "PRESENT" | "ABSENT" | "UNRESOLVED";
  age?: string;
  sex?: string;
  country?: string;
  evidence?: string;
  products: string[];
  events: string[];
};

type LabelAssessment = {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  conclusion: "EXPECTED" | "UNEXPECTED" | "UNRESOLVED";
  referenceLabelKey?: string;
  referenceLabelVersion?: string;
  referenceEffectiveDate?: string;
  evidence?: string;
  rationale?: string;
};

type CausalityAssessment = {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  methodKey?: string;
  methodVersion?: string;
  conclusion: string;
  evidence?: string;
  rationale?: string;
};

type ActiveLabelReference = {
  labelKey: string;
  clientProductId: string;
  country: string;
  labelType: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  eventTerms: string[];
  sourceDocument?: string;
};

type ActiveCausalityMethod = {
  methodKey: string;
  methodName: string;
  version: string;
  allowedConclusions: string[];
  methodology?: string;
};

type SourceEvidence = {
  location: "TITLE" | "ABSTRACT";
  quote: string;
};

type PatientExtractionSuggestion = {
  suggestionKey: string;
  patientLabel: string;
  identifiablePatientStatus: "PRESENT" | "ABSENT" | "UNRESOLVED";
  patientEvidence: SourceEvidence;
  age?: string;
  ageEvidence?: SourceEvidence;
  sex?: string;
  sexEvidence?: SourceEvidence;
  country?: string;
  countryEvidence?: SourceEvidence;
  products: Array<{ name: string; evidence: SourceEvidence }>;
  events: Array<{ name: string; evidence: SourceEvidence }>;
};

type PatientExtractionExecution = {
  runId: string;
  runVersion: number;
  sourceSha256: string;
  provider: string;
  model: string;
  requestId: string;
  createdAt: string;
  classification: "SINGLE_PATIENT" | "MULTIPLE_PATIENTS" | "NO_PATIENT" | "UNRESOLVED";
  confidence: number;
  rationale: string;
  patients: PatientExtractionSuggestion[];
  warnings: string[];
  sourceGovernanceCorrections: string[];
};

type ReviewDetail = ReviewRecord & {
  patientSegments: PatientSegment[];
  labelAssessments: LabelAssessment[];
  causalityAssessments: CausalityAssessment[];
  medicalReview?: {
    reviewStatus: string;
    finalDecision?: string;
    comments?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    reviewVersion: number;
  };
  article: Record<string, unknown>;
  screeningResult: Record<string, unknown>;
  labelReferences: ActiveLabelReference[];
  causalityMethods: ActiveCausalityMethod[];
  latestPatientExtraction?: PatientExtractionExecution;
};

function list(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function statusClass(value: string): string {
  const normalized = value.toUpperCase();
  if (["COMPLETE", "APPROVED"].includes(normalized)) return "ok";
  if (["NOT_CONFIGURED", "UNRESOLVED", "REVIEW_REQUIRED", "BLOCKED"].includes(normalized)) {
    return "warn";
  }
  return "pending";
}

function commaList(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}


function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function screeningAssessmentForProduct(
  detail: ReviewDetail,
  reportedProduct: string,
): Record<string, unknown> | undefined {
  const assessments = Array.isArray(detail.screeningResult.companySuspectAssessments)
    ? detail.screeningResult.companySuspectAssessments
    : [];
  return assessments.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      String((value as Record<string, unknown>).reportedProduct || "") === reportedProduct,
  ) as Record<string, unknown> | undefined;
}

function candidateProductId(
  detail: ReviewDetail,
  reportedProduct: string,
): string | undefined {
  const assessment = screeningAssessmentForProduct(detail, reportedProduct);
  const candidate =
    assessment &&
    typeof assessment.selectedCandidate === "object" &&
    assessment.selectedCandidate !== null &&
    !Array.isArray(assessment.selectedCandidate)
      ? (assessment.selectedCandidate as Record<string, unknown>)
      : undefined;
  const productId = candidate ? String(candidate.productId || "").trim() : "";
  return productId || undefined;
}

function governedCountry(
  detail: ReviewDetail,
  reportedProduct: string,
): string | undefined {
  const assessment = screeningAssessmentForProduct(detail, reportedProduct);
  const country = assessment ? String(assessment.countryOfInterest || "").trim() : "";
  return country || undefined;
}

function availableLabels(
  detail: ReviewDetail,
  reportedProduct: string,
): ActiveLabelReference[] {
  const productId = candidateProductId(detail, reportedProduct);
  const country = governedCountry(detail, reportedProduct);
  return detail.labelReferences.filter(
    (reference) =>
      (!productId || reference.clientProductId === productId) &&
      (!country || reference.country.toLowerCase() === country.toLowerCase()),
  );
}

export default function ReviewPage() {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<ReviewDetail | null>(null);
  const [patients, setPatients] = useState<PatientSegment[]>([]);
  const [labels, setLabels] = useState<LabelAssessment[]>([]);
  const [causality, setCausality] = useState<CausalityAssessment[]>([]);
  const [patientExtraction, setPatientExtraction] = useState<PatientExtractionExecution | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [auditReason, setAuditReason] = useState("");
  const [mrStatus, setMrStatus] = useState<"APPROVED" | "REVIEW_REQUIRED" | "EXCLUDED">("REVIEW_REQUIRED");
  const [mrDecision, setMrDecision] = useState("");
  const [mrComments, setMrComments] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/literature/review?limit=500", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Review worklist.");
      }
      setRecords(Array.isArray(payload.data?.records) ? payload.data.records : []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  async function openWorkspace(record: ReviewRecord) {
    setSaving("open");
    try {
      const response = await fetch(
        `/api/literature/review?workspaceId=${encodeURIComponent(record.workspaceId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to load Review workspace.");
      }
      const detail = payload.data.detail as ReviewDetail;
      setSelected(detail);
      setPatients(Array.isArray(detail.patientSegments) ? detail.patientSegments : []);
      setLabels(detail.labelAssessments?.length ? detail.labelAssessments : []);
      setCausality(detail.causalityAssessments?.length ? detail.causalityAssessments : []);
      setPatientExtraction(detail.latestPatientExtraction);
      setMrStatus(
        detail.medicalReview?.reviewStatus === "APPROVED" ||
          detail.medicalReview?.reviewStatus === "EXCLUDED"
          ? detail.medicalReview.reviewStatus
          : "REVIEW_REQUIRED",
      );
      setMrDecision(detail.medicalReview?.finalDecision || "");
      setMrComments(detail.medicalReview?.comments || "");
      setAuditReason("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving("");
    }
  }

  async function mutate(path: string, body: Record<string, unknown>, label: string) {
    if (!selected) return;
    if (auditReason.trim().length < 8) {
      setMessage("Enter a specific audit reason before saving a governed Review action.");
      return;
    }
    setSaving(label);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: selected.workspaceId, reason: auditReason, ...body }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Review action failed.");
      }
      setMessage(`${label} saved successfully.`);
      await load();
      await openWorkspace(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving("");
    }
  }

  async function runPatientExtraction() {
    if (!selected) return;
    if (auditReason.trim().length < 8) {
      setMessage("Enter a specific audit reason before running governed patient extraction.");
      return;
    }
    setSaving("Patient extraction");
    try {
      const response = await fetch("/api/literature/review/patient-extraction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: selected.workspaceId,
          reason: auditReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Patient extraction failed.");
      }
      const extraction = payload.data.extraction as PatientExtractionExecution;
      setPatientExtraction(extraction);
      setMessage(
        `AI proposed ${extraction.patients.length} patient segment(s). Review the source-linked evidence before applying suggestions.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving("");
    }
  }

  function applyPatientExtractionSuggestions() {
    if (!patientExtraction) return;
    const suggestions: PatientSegment[] = patientExtraction.patients.map((suggestion) => {
      const evidenceLines = [
        `Patient evidence [${suggestion.patientEvidence.location}]: ${suggestion.patientEvidence.quote}`,
        ...suggestion.products.map(
          (product) =>
            `Product ${product.name} [${product.evidence.location}]: ${product.evidence.quote}`,
        ),
        ...suggestion.events.map(
          (event) =>
            `Event ${event.name} [${event.evidence.location}]: ${event.evidence.quote}`,
        ),
      ];
      return {
        patientSegmentKey: suggestion.suggestionKey,
        patientLabel: suggestion.patientLabel,
        identifiablePatientStatus: suggestion.identifiablePatientStatus,
        age: suggestion.age,
        sex: suggestion.sex,
        country: suggestion.country,
        evidence: evidenceLines.join("\n"),
        products: suggestion.products.map((product) => product.name),
        events: suggestion.events.map((event) => event.name),
      };
    });
    setPatients(suggestions);
    setMessage(
      "AI suggestions copied into the editable segmentation form. Nothing is governed until you review and click Save Segmentation.",
    );
  }

  function addPatient() {
    if (!selected) return;
    const next = patients.length + 1;
    setPatients([
      ...patients,
      {
        patientSegmentKey: `P${next}`,
        patientLabel: `Patient ${next}`,
        identifiablePatientStatus: "UNRESOLVED",
        products: [...selected.products],
        events: [...selected.clinicalEvents],
      },
    ]);
  }

  function updatePatient(index: number, patch: Partial<PatientSegment>) {
    setPatients((current) =>
      current.map((patient, itemIndex) =>
        itemIndex === index ? { ...patient, ...patch } : patient,
      ),
    );
  }

  function addLabelAssessment() {
    const patient = patients[0];
    if (!patient || patient.products.length === 0 || patient.events.length === 0) {
      setMessage("Save at least one patient with a product and event before adding expectedness.");
      return;
    }
    setLabels((current) => [
      ...current,
      {
        patientSegmentKey: patient.patientSegmentKey,
        reportedProduct: patient.products[0],
        clinicalEvent: patient.events[0],
        conclusion: "UNRESOLVED",
        rationale: "Reference label assessment pending.",
      },
    ]);
  }

  function addCausalityAssessment() {
    const patient = patients[0];
    if (!patient || patient.products.length === 0 || patient.events.length === 0) {
      setMessage("Save at least one patient with a product and event before adding causality.");
      return;
    }
    setCausality((current) => [
      ...current,
      {
        patientSegmentKey: patient.patientSegmentKey,
        reportedProduct: patient.products[0],
        clinicalEvent: patient.events[0],
        conclusion: "UNRESOLVED",
        rationale: "Approved causality method assessment pending.",
      },
    ]);
  }

  function patientForSegment(key: string): PatientSegment | undefined {
    return patients.find((patient) => patient.patientSegmentKey === key);
  }

  const metrics = useMemo(
    () => ({
      ready: records.filter((record) => record.workspaceStatus === "READY").length,
      segmentation: records.filter((record) => record.patientSegmentationStatus !== "COMPLETE").length,
      labeling: records.filter((record) => record.labelingStatus !== "COMPLETE").length,
      causality: records.filter((record) => record.causalityStatus !== "COMPLETE").length,
      mr: records.filter((record) => record.mrReviewStatus !== "APPROVED").length,
    }),
    [records],
  );

  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="POST-SCREENING GOVERNED REVIEW"
        title="Review & Medical Review Workspace"
        subtitle="Patient-level review after an approved Screening INCLUDE: case segmentation, product-event expectedness, causality and Medical Reviewer finalization with audit traceability."
        status="Operational Review v1"
      />

      <section className="boundary-note">
        <strong>Governance boundary</strong>
        <span>
          Screening is article-level. Review / MR is patient-product-event level. Intake remains blocked until Review is complete.
        </span>
      </section>

      <section className="metrics">
        <Metric label="Ready for Review" value={metrics.ready} />
        <Metric label="Patient Segmentation Pending" value={metrics.segmentation} />
        <Metric label="Labeling Pending / Unresolved" value={metrics.labeling} />
        <Metric label="Causality Pending / Unresolved" value={metrics.causality} />
        <Metric label="MR Review Pending" value={metrics.mr} />
      </section>

      <section className="panel">
        <header>
          <div>
            <span>Governed worklist</span>
            <h2>Post-Screening Review</h2>
            <p>Only human-approved Screening INCLUDE articles enter this queue.</p>
          </div>
          <button type="button" onClick={() => void load()}>Refresh</button>
        </header>

        {message && <div className="message">{message}</div>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PMID</th><th>Article</th><th>Products</th><th>Events</th>
                <th>Patients</th><th>Labeling</th><th>Causality</th><th>MR</th><th />
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.workspaceId}>
                  <td>{record.pmid}</td>
                  <td><strong>{record.title}</strong><small>{record.packageKey}</small></td>
                  <td>{list(record.products)}</td>
                  <td>{list(record.clinicalEvents)}</td>
                  <td><Status value={record.patientSegmentationStatus} /></td>
                  <td><Status value={record.labelingStatus} /></td>
                  <td><Status value={record.causalityStatus} /></td>
                  <td><Status value={record.mrReviewStatus} /></td>
                  <td><button type="button" onClick={() => void openWorkspace(record)}>Open</button></td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr><td colSpan={9} className="empty">No Screening-approved INCLUDE article is ready for Review.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div className="drawer-backdrop">
          <aside className="drawer" aria-label="Medical Review workspace">
            <header className="drawer-header">
              <div>
                <span>Review / MR workspace</span>
                <h2>{selected.title}</h2>
                <p>PMID {selected.pmid} · {selected.workflowState}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button>
            </header>

            <section className="audit-bar">
              <label>
                <span>Audit reason for the next controlled action</span>
                <input
                  value={auditReason}
                  onChange={(event) => setAuditReason(event.target.value)}
                  placeholder="Example: Patient-level medical review after approved Screening INCLUDE."
                />
              </label>
            </section>

            <section className="step">
              <div className="step-head">
                <div>
                  <span>1 · Patient / Case Segmentation</span>
                  <h3>{selected.patientSegmentationStatus}</h3>
                </div>
                <button type="button" onClick={addPatient}>+ Add Patient</button>
              </div>
              <p>Use internal segment keys only. Do not invent patient identifiers that are not present in source evidence.</p>

              <div className="extraction-panel">
                <div className="step-head">
                  <div>
                    <strong>Source-linked AI Patient Extraction</strong>
                    <small>Suggestions only · human confirmation required</small>
                  </div>
                  <button type="button" disabled={Boolean(saving)} onClick={() => void runPatientExtraction()}>
                    {saving === "Patient extraction" ? "Extracting…" : "Run AI Extraction"}
                  </button>
                </div>

                {patientExtraction ? (
                  <>
                    <div className="extraction-meta">
                      <span>{patientExtraction.classification.replaceAll("_", " ")}</span>
                      <span>{Math.round(patientExtraction.confidence)}% confidence</span>
                      <span>Run v{patientExtraction.runVersion}</span>
                      <span>{patientExtraction.provider} · {patientExtraction.model}</span>
                    </div>
                    <p>{patientExtraction.rationale || "No extraction rationale provided."}</p>

                    {patientExtraction.patients.map((suggestion) => (
                      <article className="suggestion-card" key={suggestion.suggestionKey}>
                        <div className="suggestion-title">
                          <strong>{suggestion.suggestionKey} · {suggestion.patientLabel}</strong>
                          <Status value={suggestion.identifiablePatientStatus} />
                        </div>
                        <blockquote>
                          <b>{suggestion.patientEvidence.location}</b> · “{suggestion.patientEvidence.quote}”
                        </blockquote>
                        <div className="suggestion-facts">
                          <span>Age: {suggestion.age || "—"}</span>
                          <span>Sex: {suggestion.sex || "—"}</span>
                          <span>Country: {suggestion.country || "UNRESOLVED"}</span>
                        </div>
                        <div className="evidence-grid">
                          <div>
                            <b>Products</b>
                            {suggestion.products.map((product) => (
                              <p key={product.name + product.evidence.quote}>
                                <strong>{product.name}</strong><br />
                                {product.evidence.location}: “{product.evidence.quote}”
                              </p>
                            ))}
                          </div>
                          <div>
                            <b>Events</b>
                            {suggestion.events.map((event) => (
                              <p key={event.name + event.evidence.quote}>
                                <strong>{event.name}</strong><br />
                                {event.evidence.location}: “{event.evidence.quote}”
                              </p>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}

                    {patientExtraction.warnings.length > 0 && (
                      <div className="extraction-warning">
                        <strong>AI extraction warnings</strong>
                        <ul>{patientExtraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                      </div>
                    )}

                    {patientExtraction.sourceGovernanceCorrections.length > 0 && (
                      <div className="extraction-warning">
                        <strong>Deterministic source-governance corrections</strong>
                        <ul>{patientExtraction.sourceGovernanceCorrections.map((correction) => <li key={correction}>{correction}</li>)}</ul>
                      </div>
                    )}

                    <button
                      type="button"
                      className="secondary"
                      disabled={patientExtraction.patients.length === 0}
                      onClick={applyPatientExtractionSuggestions}
                    >
                      Apply Suggestions to Editable Form
                    </button>
                    <small className="source-hash">Source SHA-256: {patientExtraction.sourceSha256}</small>
                  </>
                ) : (
                  <p>
                    Run extraction to propose single- or multi-patient segments using only article title/abstract evidence.
                    No suggestion becomes a governed patient record automatically.
                  </p>
                )}
              </div>

              {patients.map((patient, index) => (
                <div className="patient-card" key={patient.patientSegmentKey + index}>
                  <div className="grid-3">
                    <Field label="Segment key" value={patient.patientSegmentKey} onChange={(value) => updatePatient(index, { patientSegmentKey: value })} />
                    <Field label="Patient label" value={patient.patientLabel || ""} onChange={(value) => updatePatient(index, { patientLabel: value })} />
                    <label><span>Identifiable patient</span>
                      <select value={patient.identifiablePatientStatus} onChange={(event) => updatePatient(index, { identifiablePatientStatus: event.target.value as PatientSegment["identifiablePatientStatus"] })}>
                        <option value="PRESENT">PRESENT</option><option value="ABSENT">ABSENT</option><option value="UNRESOLVED">UNRESOLVED</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid-3">
                    <Field label="Age / age group" value={patient.age || ""} onChange={(value) => updatePatient(index, { age: value })} />
                    <Field label="Sex" value={patient.sex || ""} onChange={(value) => updatePatient(index, { sex: value })} />
                    <Field label="Country (source-evidenced only)" value={patient.country || ""} onChange={(value) => updatePatient(index, { country: value })} />
                  </div>
                  <Field label="Products (comma separated)" value={patient.products.join(", ")} onChange={(value) => updatePatient(index, { products: commaList(value) })} />
                  <Field label="Events (comma separated)" value={patient.events.join(", ")} onChange={(value) => updatePatient(index, { events: commaList(value) })} />
                  <Field label="Source evidence / rationale" value={patient.evidence || ""} onChange={(value) => updatePatient(index, { evidence: value })} />
                  <button type="button" className="danger" onClick={() => setPatients((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove Patient</button>
                </div>
              ))}
              <div className="actions">
                <button type="button" disabled={Boolean(saving)} onClick={() => void mutate("/api/literature/review/patient-segmentation", { patients }, "Patient segmentation")}>
                  {saving === "Patient segmentation" ? "Saving…" : "Save Segmentation"}
                </button>
                <span className="hint">Add only source-supported product-event relationships; the system will not create a Cartesian product automatically.</span>
              </div>
            </section>

            <section className="step">
              <span>2 · Labeling / Expectedness</span>
              <h3>{selected.labelingStatus}</h3>
              <div className="step-head">
                <p>{selected.labelReferences.length
                  ? `${selected.labelReferences.length} active governed Label / RSI reference(s) available. Expectedness is calculated from the selected reference.`
                  : "No active Label / RSI configuration is available; expectedness must remain UNRESOLVED."}</p>
                <button type="button" onClick={addLabelAssessment}>+ Add Assessment</button>
              </div>
              {labels.map((row, index) => (
                <div className="assessment-card" key={`label-${row.patientSegmentKey}-${row.reportedProduct}-${row.clinicalEvent}-${index}`}>
                  <div className="grid-3">
                    <label><span>Patient segment</span>
                      <select value={row.patientSegmentKey} onChange={(event) => {
                        const patient = patientForSegment(event.target.value);
                        setLabels((current) => current.map((item, i) => i === index ? {
                          ...item,
                          patientSegmentKey: event.target.value,
                          reportedProduct: patient?.products[0] || "",
                          clinicalEvent: patient?.events[0] || "",
                        } : item));
                      }}>
                        {patients.map((patient) => <option key={patient.patientSegmentKey} value={patient.patientSegmentKey}>{patient.patientSegmentKey}</option>)}
                      </select>
                    </label>
                    <label><span>Product</span>
                      <select value={row.reportedProduct} onChange={(event) => setLabels((current) => current.map((item, i) => i === index ? { ...item, reportedProduct: event.target.value } : item))}>
                        {(patientForSegment(row.patientSegmentKey)?.products || []).map((product) => <option key={product} value={product}>{product}</option>)}
                      </select>
                    </label>
                    <label><span>Event</span>
                      <select value={row.clinicalEvent} onChange={(event) => setLabels((current) => current.map((item, i) => i === index ? { ...item, clinicalEvent: event.target.value } : item))}>
                        {(patientForSegment(row.patientSegmentKey)?.events || []).map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="grid-3">
                    <label><span>Expectedness</span>
                      <select value={row.conclusion} onChange={(event) => setLabels((current) => current.map((item, i) => i === index ? { ...item, conclusion: event.target.value as LabelAssessment["conclusion"] } : item))}>
                        <option value="UNRESOLVED">UNRESOLVED</option><option value="EXPECTED">EXPECTED</option><option value="UNEXPECTED">UNEXPECTED</option>
                      </select>
                    </label>
                    <label><span>Active Label / RSI</span>
                      <select
                        value={row.referenceLabelKey || ""}
                        onChange={(event) => {
                          const reference = availableLabels(selected, row.reportedProduct).find(
                            (item) => item.labelKey === event.target.value,
                          );
                          setLabels((current) => current.map((item, i) => i === index ? {
                            ...item,
                            referenceLabelKey: reference?.labelKey,
                            referenceLabelVersion: reference?.version,
                            referenceEffectiveDate: reference?.effectiveFrom?.slice(0, 10),
                            conclusion: reference
                              ? reference.eventTerms.map(normalizeTerm).includes(normalizeTerm(item.clinicalEvent))
                                ? "EXPECTED"
                                : "UNEXPECTED"
                              : "UNRESOLVED",
                            rationale: reference
                              ? `Expectedness resolved against active ${reference.labelType} ${reference.labelKey} v${reference.version}.`
                              : item.rationale,
                          } : item));
                        }}
                      >
                        <option value="">No governed reference selected</option>
                        {availableLabels(selected, row.reportedProduct).map((reference) => (
                          <option key={reference.labelKey + reference.version} value={reference.labelKey}>
                            {reference.labelKey} · {reference.labelType} · v{reference.version} · {reference.country}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Version" value={row.referenceLabelVersion || ""} onChange={() => undefined} />
                  </div>
                  <div className="grid-2">
                    <Field label="Effective date (YYYY-MM-DD)" value={row.referenceEffectiveDate || ""} onChange={(value) => setLabels((current) => current.map((item, i) => i === index ? { ...item, referenceEffectiveDate: value } : item))} />
                    <Field label="Label evidence" value={row.evidence || ""} onChange={(value) => setLabels((current) => current.map((item, i) => i === index ? { ...item, evidence: value } : item))} />
                  </div>
                  <Field label="Expectedness rationale" value={row.rationale || ""} onChange={(value) => setLabels((current) => current.map((item, i) => i === index ? { ...item, rationale: value } : item))} />
                  <button type="button" className="danger" onClick={() => setLabels((current) => current.filter((_, i) => i !== index))}>Remove Assessment</button>
                </div>
              ))}
              <button type="button" disabled={Boolean(saving) || labels.length === 0} onClick={() => void mutate("/api/literature/review/labeling", { assessments: labels }, "Labeling assessment")}>
                {saving === "Labeling assessment" ? "Saving…" : "Save Labeling / Expectedness"}
              </button>
            </section>

            <section className="step">
              <span>3 · Causality</span>
              <h3>{selected.causalityStatus}</h3>
              <div className="step-head">
                <p>{selected.causalityMethods.length
                  ? `${selected.causalityMethods.length} active governed causality method(s) available. Conclusions are restricted to the selected method.`
                  : "No active causality method is configured; causality must remain UNRESOLVED."}</p>
                <button type="button" onClick={addCausalityAssessment}>+ Add Assessment</button>
              </div>
              {causality.map((row, index) => (
                <div className="assessment-card" key={`cause-${row.patientSegmentKey}-${row.reportedProduct}-${row.clinicalEvent}-${index}`}>
                  <div className="grid-3">
                    <label><span>Patient segment</span>
                      <select value={row.patientSegmentKey} onChange={(event) => {
                        const patient = patientForSegment(event.target.value);
                        setCausality((current) => current.map((item, i) => i === index ? {
                          ...item,
                          patientSegmentKey: event.target.value,
                          reportedProduct: patient?.products[0] || "",
                          clinicalEvent: patient?.events[0] || "",
                        } : item));
                      }}>
                        {patients.map((patient) => <option key={patient.patientSegmentKey} value={patient.patientSegmentKey}>{patient.patientSegmentKey}</option>)}
                      </select>
                    </label>
                    <label><span>Product</span>
                      <select value={row.reportedProduct} onChange={(event) => setCausality((current) => current.map((item, i) => i === index ? { ...item, reportedProduct: event.target.value } : item))}>
                        {(patientForSegment(row.patientSegmentKey)?.products || []).map((product) => <option key={product} value={product}>{product}</option>)}
                      </select>
                    </label>
                    <label><span>Event</span>
                      <select value={row.clinicalEvent} onChange={(event) => setCausality((current) => current.map((item, i) => i === index ? { ...item, clinicalEvent: event.target.value } : item))}>
                        {(patientForSegment(row.patientSegmentKey)?.events || []).map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="grid-3">
                    <label><span>Conclusion</span>
                      <select value={row.conclusion} onChange={(event) => setCausality((current) => current.map((item, i) => i === index ? { ...item, conclusion: event.target.value } : item))}>
                        <option value="UNRESOLVED">UNRESOLVED</option>
                        {(selected.causalityMethods.find((method) => method.methodKey === row.methodKey && method.version === row.methodVersion)?.allowedConclusions || [])
                          .filter((value) => value !== "UNRESOLVED")
                          .map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                    <label><span>Approved causality method</span>
                      <select
                        value={row.methodKey ? `${row.methodKey}::${row.methodVersion || ""}` : ""}
                        onChange={(event) => {
                          const [methodKey, version] = event.target.value.split("::");
                          const method = selected.causalityMethods.find(
                            (item) => item.methodKey === methodKey && item.version === version,
                          );
                          setCausality((current) => current.map((item, i) => i === index ? {
                            ...item,
                            methodKey: method?.methodKey,
                            methodVersion: method?.version,
                            conclusion:
                              method && method.allowedConclusions.includes(item.conclusion)
                                ? item.conclusion
                                : "UNRESOLVED",
                            rationale: method
                              ? `Causality assessed using governed method ${method.methodName} v${method.version}.`
                              : item.rationale,
                          } : item));
                        }}
                      >
                        <option value="">No governed method selected</option>
                        {selected.causalityMethods.map((method) => (
                          <option key={method.methodKey + method.version} value={`${method.methodKey}::${method.version}`}>
                            {method.methodName} · {method.methodKey} · v{method.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="Method version" value={row.methodVersion || ""} onChange={() => undefined} />
                  </div>
                  <Field label="Causality evidence" value={row.evidence || ""} onChange={(value) => setCausality((current) => current.map((item, i) => i === index ? { ...item, evidence: value } : item))} />
                  <Field label="Causality rationale" value={row.rationale || ""} onChange={(value) => setCausality((current) => current.map((item, i) => i === index ? { ...item, rationale: value } : item))} />
                  <button type="button" className="danger" onClick={() => setCausality((current) => current.filter((_, i) => i !== index))}>Remove Assessment</button>
                </div>
              ))}
              <button type="button" disabled={Boolean(saving) || causality.length === 0} onClick={() => void mutate("/api/literature/review/causality", { assessments: causality }, "Causality assessment")}>
                {saving === "Causality assessment" ? "Saving…" : "Save Causality"}
              </button>
            </section>

            <section className="step">
              <span>4 · Medical Reviewer Finalization</span>
              <h3>{selected.mrReviewStatus}</h3>
              <div className="grid-2">
                <label><span>MR status</span>
                  <select value={mrStatus} onChange={(event) => setMrStatus(event.target.value as typeof mrStatus)}>
                    <option value="REVIEW_REQUIRED">REVIEW REQUIRED</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="EXCLUDED">EXCLUDED</option>
                  </select>
                </label>
                <Field label="Final decision" value={mrDecision} onChange={setMrDecision} />
              </div>
              <Field label="Medical Review comments" value={mrComments} onChange={setMrComments} />
              <button type="button" disabled={Boolean(saving)} onClick={() => void mutate("/api/literature/review/medical", { status: mrStatus, finalDecision: mrDecision, comments: mrComments }, "Medical Review")}>
                {saving === "Medical Review" ? "Saving…" : "Save Medical Review"}
              </button>
              {selected.medicalReview && (
                <p className="history">Latest MR v{selected.medicalReview.reviewVersion}: {selected.medicalReview.reviewStatus} · {selected.medicalReview.reviewedBy || "Reviewer"} · {selected.medicalReview.reviewedAt || "—"}</p>
              )}
            </section>

            <div className="gate">
              Intake is unlocked only after patient segmentation is COMPLETE, labeling and causality are governed as COMPLETE or UNRESOLVED, and Medical Review is APPROVED.
            </div>
          </aside>
        </div>
      )}

      <style jsx>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .boundary-note{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;padding:13px 16px;border:1px solid #bae6fd;border-radius:12px;background:#f0f9ff;color:#075985;font-size:11px}
        .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
        .panel{overflow:hidden;border:1px solid #dbe4ef;border-radius:16px;background:#fff}
        .panel>header{display:flex;justify-content:space-between;gap:20px;padding:18px 20px;border-bottom:1px solid #e2e8f0}
        .panel>header span,.step>span,.step-head span{color:#1d4ed8;font-size:9px;font-weight:900;text-transform:uppercase}
        .panel h2{margin:5px 0;font-size:20px}.panel p{margin:0;color:#64748b;font-size:11px}
        button{border:0;border-radius:8px;padding:8px 11px;background:#185abd;color:#fff;font:inherit;font-size:10px;font-weight:800;cursor:pointer}
        button:disabled{opacity:.45;cursor:not-allowed}.secondary{background:#475569}.danger{background:#b91c1c}
        .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{padding:11px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
        th{background:#f8fafc;color:#475569;font-size:8px;text-transform:uppercase}
        td strong,td small{display:block}td small{margin-top:3px;color:#94a3b8}
        .message{margin:12px 16px;padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:10px}.empty{padding:28px;text-align:center;color:#64748b}
        .drawer-backdrop{position:fixed;inset:0;z-index:90;display:flex;justify-content:flex-end;background:rgba(15,23,42,.45)}
        .drawer{width:min(920px,98vw);height:100%;overflow-y:auto;background:#f8fafc;box-shadow:-20px 0 60px rgba(15,23,42,.25)}
        .drawer-header{display:flex;justify-content:space-between;gap:20px;padding:22px;color:#fff;background:linear-gradient(135deg,#0f172a,#1d4ed8)}
        .drawer-header span{color:#7dd3fc;font-size:9px;font-weight:900;text-transform:uppercase}.drawer-header h2{margin:6px 0;font-size:22px}.drawer-header p{margin:0;color:#dbeafe;font-size:11px}
        .drawer-header button{width:38px;height:38px;padding:0;background:rgba(255,255,255,.12);font-size:22px}
        .audit-bar{position:sticky;top:0;z-index:2;padding:12px 18px;border-bottom:1px solid #dbe4ef;background:#fff}.audit-bar label{display:block}
        .step{margin:14px 18px 0;padding:16px;border:1px solid #dbe4ef;border-radius:12px;background:#fff}.step-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .step h3{margin:6px 0;font-size:15px}.step p{margin:0 0 12px;color:#64748b;font-size:11px;line-height:1.6}
        .patient-card,.assessment-card{margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}.assessment-card strong{display:block;margin-bottom:10px;font-size:11px}
        .extraction-panel{margin:12px 0;padding:14px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff}.extraction-panel small{display:block;margin-top:3px;color:#64748b;font-size:8px}.extraction-meta{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.extraction-meta span{padding:4px 7px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:8px;font-weight:800}.suggestion-card{margin:10px 0;padding:12px;border:1px solid #cbd5e1;border-radius:9px;background:#fff}.suggestion-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.suggestion-title strong{font-size:11px}.suggestion-card blockquote{margin:9px 0;padding:8px 10px;border-left:3px solid #2563eb;background:#f8fafc;color:#334155;font-size:9px;line-height:1.5}.suggestion-facts{display:flex;gap:12px;flex-wrap:wrap;color:#475569;font-size:9px}.evidence-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.evidence-grid>div{padding:9px;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc}.evidence-grid b{font-size:9px}.evidence-grid p{margin:7px 0 0!important;font-size:8px!important;line-height:1.5!important}.extraction-warning{margin:9px 0;padding:9px;border:1px solid #fde68a;border-radius:7px;background:#fffbeb;color:#92400e;font-size:8px}.extraction-warning ul{margin:5px 0 0;padding-left:16px}.source-hash{margin-top:8px!important;word-break:break-all}
        .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.actions{display:flex;gap:8px;flex-wrap:wrap}.hint{align-self:center;color:#64748b;font-size:9px}
        label{display:block;margin-bottom:9px}label span{display:block;margin-bottom:4px;color:#475569;font-size:8px;font-weight:800;text-transform:uppercase}
        input,select{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px 9px;background:#fff;color:#0f172a;font:inherit;font-size:10px}
        .gate{margin:14px 18px 22px;padding:13px 15px;border:1px solid #fed7aa;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:11px;font-weight:700}.history{margin-top:10px!important}
        @media(max-width:980px){.metrics{grid-template-columns:1fr 1fr}.grid-3{grid-template-columns:1fr}.grid-2{grid-template-columns:1fr}}
        @media(max-width:700px){.app-shell{padding:12px}.metrics{grid-template-columns:1fr}.boundary-note{flex-direction:column}}
      `}</style>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric"><span>{label}</span><strong>{value}</strong><style jsx>{`
    .metric{padding:13px 14px;border:1px solid #dbe4ef;border-radius:12px;background:#fff}
    span{display:block;color:#64748b;font-size:8px;font-weight:900;text-transform:uppercase}
    strong{display:block;margin-top:5px;font-size:22px}
  `}</style></article>;
}

function Status({ value }: { value: string }) {
  return <span className={`status ${statusClass(value)}`}>{value.replaceAll("_", " ")}<style jsx>{`
    .status{display:inline-block;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:900;text-transform:uppercase}
    .ok{color:#166534;background:#dcfce7}.warn{color:#92400e;background:#fef3c7}.pending{color:#1e40af;background:#dbeafe}
  `}</style></span>;
}
