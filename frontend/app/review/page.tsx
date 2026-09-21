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

export default function ReviewPage() {
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<ReviewDetail | null>(null);
  const [patients, setPatients] = useState<PatientSegment[]>([]);
  const [labels, setLabels] = useState<LabelAssessment[]>([]);
  const [causality, setCausality] = useState<CausalityAssessment[]>([]);
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
                <p>EXPECTED or UNEXPECTED requires an approved reference label key, version and effective date. Otherwise retain UNRESOLVED.</p>
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
                    <Field label="Label / RSI key" value={row.referenceLabelKey || ""} onChange={(value) => setLabels((current) => current.map((item, i) => i === index ? { ...item, referenceLabelKey: value } : item))} />
                    <Field label="Version" value={row.referenceLabelVersion || ""} onChange={(value) => setLabels((current) => current.map((item, i) => i === index ? { ...item, referenceLabelVersion: value } : item))} />
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
                <p>A non-UNRESOLVED conclusion requires the approved causality method key and version. AI or temporal association alone must not create causality.</p>
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
                    <Field label="Conclusion" value={row.conclusion} onChange={(value) => setCausality((current) => current.map((item, i) => i === index ? { ...item, conclusion: value } : item))} />
                    <Field label="Method key" value={row.methodKey || ""} onChange={(value) => setCausality((current) => current.map((item, i) => i === index ? { ...item, methodKey: value } : item))} />
                    <Field label="Method version" value={row.methodVersion || ""} onChange={(value) => setCausality((current) => current.map((item, i) => i === index ? { ...item, methodVersion: value } : item))} />
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
