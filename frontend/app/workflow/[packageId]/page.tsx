"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type WorkflowHistoryItem = {
  timestamp?: string;
  from_status?: string;
  to_status?: string;
  reason?: string;
  actor?: string;
  metadata?: Record<string, unknown>;
};

type WorkflowState = {
  status?: string;
  state?: string;
  updated_at?: string;
  updatedAt?: string;
  history?: WorkflowHistoryItem[];
};

type PackageApiResponse = {
  success: boolean;
  error?: string;
  tenant_id?: string;
  package_id?: string;
  metadata?: any;
  workflow_state?: WorkflowState | null;
  hits_output?: any;
  screening_output?: any;
  intake_input?: any;
};

type DownloadFileType =
  | "metadata"
  | "workflow_state"
  | "hits_output"
  | "screening_output"
  | "intake_input";

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  HITS_RUNNING: "Hits Running",
  HITS_COMPLETE: "Hits Complete",
  SCREENING_RUNNING: "Screening Running",
  SCREENING_COMPLETE: "Screening Complete",
  INTAKE_INPUT_CREATED: "Intake Input Created",
};

const tabs = ["Overview", "Evidence", "Hits", "Screening", "Intake", "Audit", "Download"];

function text(value: any, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") return fallback;
  return String(value);
}

function formatDate(value: any) {
  if (!value) return "—";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  } catch {
    return String(value);
  }
}

function findValue(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;

  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findValue(value, keys);
      if (found !== undefined && found !== null && found !== "") return found;
    }
  }

  return undefined;
}

function getArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${status.toLowerCase()}`}>
      {STATUS_LABELS[status] || status.replaceAll("_", " ")}
    </span>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="field-card">
      <span>{label}</span>
      <strong>{text(value)}</strong>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section-card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function WorkflowDetailsPage() {
  const params = useParams<{ packageId: string }>();
  const packageId = decodeURIComponent(params.packageId || "");

  const [activeTab, setActiveTab] = useState("Overview");
  const [pkg, setPkg] = useState<PackageApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [downloading, setDownloading] = useState<DownloadFileType | null>(null);

  async function loadPackage() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/workflow/package/${encodeURIComponent(packageId)}`, {
        cache: "no-store",
      });

      const data: PackageApiResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load workflow package.");
      }

      setPkg(data);
    } catch (err: any) {
      setError(err?.message || "Unable to load workflow package.");
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  async function downloadFile(fileType: DownloadFileType, label: string) {
    try {
      setDownloading(fileType);

      const response = await fetch(
        `/api/workflow/download/${encodeURIComponent(packageId)}/${fileType}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        let message = `Failed to download ${label}.`;
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          // Keep default message if response is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${packageId}_${fileType}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      showToast(`${label} downloaded successfully.`);
    } catch (err: any) {
      showToast(err?.message || `Failed to download ${label}.`);
    } finally {
      setDownloading(null);
    }
  }

  useEffect(() => {
    if (packageId) {
      loadPackage();
    }
  }, [packageId]);

  const metadata = pkg?.metadata || {};
  const workflowState = pkg?.workflow_state || {};
  const hitsOutput = pkg?.hits_output || {};
  const screeningOutput = pkg?.screening_output || {};
  const intakeInput = pkg?.intake_input || {};

  const hits = getArray(hitsOutput.hits);
  const screening = getArray(screeningOutput.screening);
  const intakeInputs = getArray(intakeInput.intake_inputs);
  const latestHit = hits[0] || {};
  const latestScreening = screening[0] || {};
  const latestIntake = intakeInputs[0] || {};

  const currentStatus = text(workflowState.status || workflowState.state, "NEW");
  const history = workflowState.history || [];

  const title = text(metadata.title || latestIntake.title || latestHit.title);
  const pmid = text(metadata.pmid || hitsOutput.pmid || screeningOutput.pmid || intakeInput.pmid);
  const journal = metadata.journal || latestIntake.journal || latestHit.journal;
  const publicationDate =
    metadata.publication_date || latestIntake.publication_date || latestHit.publication_date;
  const authors = metadata.authors || metadata.primary_author || latestHit.primary_author;
  const country =
    latestIntake.country ||
    latestScreening.country ||
    latestHit.country_of_interest ||
    metadata.country ||
    findValue(metadata, ["patient_country", "coi_country"]);
  const abstract = metadata.abstract;
  const source = metadata.source;
  const doi = metadata.doi;

  const companySuspects =
    latestScreening.company_suspect_drugs ||
    latestIntake.company_suspect_drugs ||
    findValue(hitsOutput, ["company_suspect_drugs", "suspect_products"]);
  const coSuspects = latestScreening.co_suspect_drugs;
  const concomitantMedications = latestScreening.concomitant_medications;
  const treatmentMedications = latestScreening.treatment_medications;
  const clinicalEvents = latestScreening.clinical_events || latestIntake.clinical_events;
  const specialSituations = latestScreening.special_situations || latestIntake.special_situations;
  const seriousness = latestScreening.seriousness || latestScreening.event_severity;
  const patientSafety = latestScreening.patient_safety || latestIntake.patient_safety;
  const patientIdentification =
    latestScreening.patient_identification_pii || latestIntake.patient_identification_pii;
  const coi = latestScreening.coi || latestIntake.coi;
  const activeMah = latestScreening.active_mah || latestIntake.active_mah;
  const screeningDecision = latestScreening.screening_decision || latestIntake.screening_decision;
  const screeningReasoning = latestScreening.screening_reasoning;
  const screeningFlags = latestScreening.flags || latestIntake.screening_flags;

  const progress = useMemo(
    () => [
      {
        label: "Hits",
        done:
          Number(hitsOutput.hits_count || 0) > 0 ||
          ["HITS_COMPLETE", "SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(currentStatus),
      },
      {
        label: "Screening",
        done:
          Number(screeningOutput.screening_count || 0) > 0 ||
          ["SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(currentStatus),
      },
      {
        label: "Intake",
        done:
          Number(intakeInput.intake_input_count || 0) > 0 ||
          currentStatus === "INTAKE_INPUT_CREATED",
      },
    ],
    [hitsOutput, screeningOutput, intakeInput, currentStatus]
  );

  if (loading) {
    return (
      <main className="details-shell">
        <div className="panel">Loading package...</div>
      </main>
    );
  }

  if (error || !pkg) {
    return (
      <main className="details-shell">
        <div className="panel">
          <Link href="/workflow" className="back-link">
            ← Back to Workflow
          </Link>
          <h1>Package not found</h1>
          <p>{error || `No package found for ${packageId}.`}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="details-shell">
      <div className="hero-card">
        <div>
          <Link href="/workflow" className="back-link">
            ← Back to Workflow
          </Link>
          <h1>{packageId}</h1>
          <p>{title}</p>
        </div>

        <div className="hero-meta">
          <StatusBadge status={currentStatus} />
          <span>Tenant: {text(pkg.tenant_id)}</span>
          <span>PMID: {pmid}</span>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <>
          <Section title="Workflow Progress">
            <div className="progress-row">
              {progress.map((step) => (
                <div key={step.label} className={`progress-step ${step.done ? "done" : ""}`}>
                  <span>{step.done ? "✓" : "○"}</span>
                  <strong>{step.label}</strong>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid section-gap">
            <Field label="Package ID" value={packageId} />
            <Field label="PMID" value={pmid} />
            <Field label="Current Status" value={STATUS_LABELS[currentStatus] || currentStatus} />
            <Field label="Last Updated" value={formatDate(workflowState.updated_at || workflowState.updatedAt)} />
            <Field label="Hits Generated" value={hitsOutput.hits_count || hits.length} />
            <Field label="Screening Records" value={screeningOutput.screening_count || screening.length} />
            <Field label="Intake Inputs" value={intakeInput.intake_input_count || intakeInputs.length} />
            <Field label="Country of Interest" value={country} />
          </div>
        </>
      )}

      {activeTab === "Evidence" && (
        <Section title="Evidence Package">
          <div className="grid">
            <Field label="Article Title" value={title} />
            <Field label="Journal" value={journal} />
            <Field label="Publication Date" value={publicationDate} />
            <Field label="DOI" value={doi} />
            <Field label="Authors" value={authors} />
            <Field label="Source" value={source} />
            <Field label="Country" value={country} />
            <Field label="Full Text Availability" value={findValue(metadata, ["full_text_available", "fullTextAvailable", "full_text"]) || "Not assessed"} />
          </div>

          <div className="text-panel">
            <h3>Abstract</h3>
            <p>{text(abstract, "No abstract available in this evidence package.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Hits" && (
        <Section title="Hits Output">
          <div className="grid">
            <Field label="Hits Count" value={hitsOutput.hits_count || hits.length} />
            <Field label="Product Name" value={latestHit.product_name} />
            <Field label="Normalized Identity" value={latestHit.normalized_identity} />
            <Field label="Matched Term" value={latestHit.matched_term} />
            <Field label="Match Type" value={latestHit.match_type} />
            <Field label="Match Source" value={latestHit.match_source} />
            <Field label="MAH Country Match" value={latestHit.mah_country_match === true ? "Yes" : latestHit.mah_country_match === false ? "No" : "—"} />
            <Field label="Confidence" value={latestHit.confidence_score ? `${Math.round(latestHit.confidence_score * 100)}%` : "—"} />
          </div>

          <div className="text-panel">
            <h3>Evidence Sentence</h3>
            <p>{text(latestHit.evidence_sentence, "No evidence sentence available.")}</p>
          </div>

          <div className="text-panel">
            <h3>AI Summary</h3>
            <p>{text(latestHit.ai_summary, "No AI summary available.")}</p>
          </div>

          <div className="text-panel">
            <h3>QC Flags</h3>
            {getArray(latestHit.qc_flags).length > 0 ? (
              <div className="flag-list">
                {getArray(latestHit.qc_flags).map((flag, index) => (
                  <div key={index} className="flag-card">
                    <strong>{text(flag.field_name, "Flag")}</strong>
                    <span>{text(flag.severity)}</span>
                    <p>{text(flag.reason)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No QC flags available.</p>
            )}
          </div>
        </Section>
      )}

      {activeTab === "Screening" && (
        <Section title="Screening Output">
          <div className="grid">
            <Field label="Screening Status" value={latestScreening.screening_status} />
            <Field label="Decision" value={screeningDecision} />
            <Field label="Company Suspect Drugs" value={companySuspects} />
            <Field label="Active MAH" value={activeMah} />
            <Field label="COI" value={coi} />
            <Field label="Patient Safety" value={patientSafety} />
            <Field label="Patient Identification / PII" value={patientIdentification} />
            <Field label="Seriousness" value={seriousness} />
            <Field label="Clinical Events" value={clinicalEvents} />
            <Field label="Special Situations" value={specialSituations} />
            <Field label="Co-Suspect Drugs" value={coSuspects} />
            <Field label="Concomitant Medications" value={concomitantMedications} />
            <Field label="Treatment Medications" value={treatmentMedications} />
            <Field label="Generated At" value={formatDate(latestScreening.generated_at)} />
            <Field label="Intake Status" value={latestScreening.intake_status} />
            <Field label="Flags" value={screeningFlags} />
          </div>

          <div className="text-panel">
            <h3>Screening Reasoning</h3>
            <p>{text(screeningReasoning, "No screening reasoning available.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Intake" && (
        <Section title="Intake Package">
          <div className="grid">
            <Field label="Intake Created" value={Number(intakeInput.intake_input_count || 0) > 0 ? "Yes" : "No"} />
            <Field label="Source Type" value={latestIntake.source_type || "Literature"} />
            <Field label="Export Boundary" value="intake_input.json" />
            <Field label="Module Boundary" value="STOP" />
            <Field label="Title" value={latestIntake.title || title} />
            <Field label="Country" value={latestIntake.country || country} />
            <Field label="Company Suspect Drugs" value={latestIntake.company_suspect_drugs} />
            <Field label="Clinical Events" value={latestIntake.clinical_events} />
            <Field label="Special Situations" value={latestIntake.special_situations} />
            <Field label="Patient Safety" value={latestIntake.patient_safety} />
            <Field label="COI" value={latestIntake.coi} />
            <Field label="Active MAH" value={latestIntake.active_mah} />
            <Field label="Screening Decision" value={latestIntake.screening_decision} />
            <Field label="Screening Flags" value={latestIntake.screening_flags} />
          </div>

          <div className="text-panel">
            <h3>Human-Readable Intake Summary</h3>
            <p>
              {Number(intakeInput.intake_input_count || 0) > 0
                ? "The intake input package has been created successfully. This is the final output of ClinixAI Literature Screening V1."
                : "Intake input has not been created yet."}
            </p>
          </div>

          <div className="boundary-card">
            Literature Screening V1 ends here. Common Intake, Case Processing, QC Engine, and
            Submission are not part of this module.
          </div>
        </Section>
      )}

      {activeTab === "Audit" && (
        <Section title="Audit Trail">
          {history.length > 0 ? (
            <div className="timeline">
              {history.map((item, index) => (
                <div key={`${item.timestamp}-${index}`} className="timeline-item done">
                  <span />
                  <div>
                    <strong>
                      {text(item.from_status)} → {text(item.to_status)}
                    </strong>
                    <p>{text(item.reason)}</p>
                    <small>
                      {formatDate(item.timestamp)} · Actor: {text(item.actor, "system")}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="timeline">
              <div className="timeline-item done">
                <span />
                <div>
                  <strong>Evidence package identified</strong>
                  <p>Package loaded into Literature Workflow Manager.</p>
                </div>
              </div>

              <div className={`timeline-item ${progress[0].done ? "done" : ""}`}>
                <span />
                <div>
                  <strong>Hits workflow</strong>
                  <p>{progress[0].done ? "Hits output available." : "Hits not completed yet."}</p>
                </div>
              </div>

              <div className={`timeline-item ${progress[1].done ? "done" : ""}`}>
                <span />
                <div>
                  <strong>Screening workflow</strong>
                  <p>{progress[1].done ? "Screening output available." : "Screening not completed yet."}</p>
                </div>
              </div>

              <div className={`timeline-item ${progress[2].done ? "done" : ""}`}>
                <span />
                <div>
                  <strong>Intake input builder</strong>
                  <p>
                    {progress[2].done
                      ? "intake_input.json created. Literature module stops here."
                      : "Intake input not created yet."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Section>
      )}

      {activeTab === "Download" && (
        <Section title="Download Package Outputs">
          <div className="download-grid">
            <button
              disabled={!metadata || downloading !== null}
              onClick={() => downloadFile("metadata", "Evidence metadata")}
            >
              {downloading === "metadata" ? "Downloading..." : "⬇ Download Evidence Metadata"}
            </button>

            <button
              disabled={!workflowState || downloading !== null}
              onClick={() => downloadFile("workflow_state", "Workflow state")}
            >
              {downloading === "workflow_state" ? "Downloading..." : "⬇ Download Workflow State"}
            </button>

            <button
              disabled={hits.length === 0 || downloading !== null}
              onClick={() => downloadFile("hits_output", "Hits output")}
            >
              {downloading === "hits_output" ? "Downloading..." : "⬇ Download Hits Output"}
            </button>

            <button
              disabled={screening.length === 0 || downloading !== null}
              onClick={() => downloadFile("screening_output", "Screening output")}
            >
              {downloading === "screening_output" ? "Downloading..." : "⬇ Download Screening Output"}
            </button>

            <button
              disabled={intakeInputs.length === 0 || downloading !== null}
              onClick={() => downloadFile("intake_input", "Intake input")}
            >
              {downloading === "intake_input" ? "Downloading..." : "⬇ Download Intake Input"}
            </button>
          </div>

          <p className="note">
            Downloads are generated directly from the evidence package files. Literature Screening V1 exports intake_input.json and stops.
          </p>
        </Section>
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .details-shell {
          min-height: 100vh;
          background: #f4f7fb;
          padding: 24px;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
        }

        .hero-card,
        .section-card,
        .panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .hero-card {
          padding: 28px;
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }

        .back-link {
          display: inline-block;
          margin-bottom: 16px;
          color: #185a9d;
          text-decoration: none;
          font-weight: 700;
        }

        h1 {
          margin: 0 0 10px;
          font-size: 30px;
        }

        h2 {
          margin: 0 0 20px;
          font-size: 22px;
        }

        h3 {
          margin: 0 0 12px;
          font-size: 16px;
        }

        p {
          margin: 0;
          line-height: 1.6;
          color: #334155;
        }

        small {
          display: block;
          margin-top: 8px;
          color: #64748b;
          font-size: 12px;
        }

        .hero-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          font-size: 14px;
        }

        .status-badge {
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          background: #e8f5e9;
          color: #137333;
          text-transform: uppercase;
        }

        .status-badge.new {
          background: #eef2f7;
          color: #475569;
        }

        .status-badge.hits_running,
        .status-badge.screening_running {
          background: #e0f2fe;
          color: #075985;
        }

        .status-badge.hits_complete {
          background: #ecfeff;
          color: #0e7490;
        }

        .status-badge.screening_complete {
          background: #f3e8ff;
          color: #7e22ce;
        }

        .status-badge.intake_input_created {
          background: #dcfce7;
          color: #166534;
        }

        .tabs {
          margin: 18px 0;
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 16px;
          padding: 8px;
          display: flex;
          gap: 8px;
          overflow-x: auto;
        }

        .tabs button {
          border: none;
          background: transparent;
          padding: 12px 18px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 700;
          color: #334155;
          white-space: nowrap;
        }

        .tabs button.active {
          background: #185a9d;
          color: #ffffff;
        }

        .section-card,
        .panel {
          padding: 28px;
        }

        .section-gap {
          margin-top: 18px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(180px, 1fr));
          gap: 16px;
        }

        .field-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          background: #fbfdff;
          min-height: 86px;
        }

        .field-card span {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 8px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .field-card strong {
          display: block;
          font-size: 14px;
          color: #0f172a;
          line-height: 1.5;
          word-break: break-word;
        }

        .text-panel {
          margin-top: 18px;
          padding: 20px;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .progress-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .progress-step {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: #f8fafc;
        }

        .progress-step span {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #e2e8f0;
          color: #475569;
          font-weight: 900;
        }

        .progress-step.done span {
          background: #16a34a;
          color: #ffffff;
        }

        .progress-step.done {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }

        .flag-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .flag-card {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px;
          background: #ffffff;
        }

        .flag-card strong {
          display: block;
          margin-bottom: 6px;
        }

        .flag-card span {
          display: inline-block;
          margin-bottom: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #fef3c7;
          color: #92400e;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .timeline-item {
          display: flex;
          gap: 14px;
          padding: 16px;
          border-radius: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .timeline-item > span {
          width: 14px;
          height: 14px;
          margin-top: 4px;
          border-radius: 999px;
          background: #cbd5e1;
          flex: 0 0 auto;
        }

        .timeline-item.done > span {
          background: #16a34a;
        }

        .timeline-item strong {
          display: block;
          margin-bottom: 6px;
        }

        .download-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .download-grid button {
          border: none;
          border-radius: 14px;
          padding: 16px;
          background: #185a9d;
          color: #ffffff;
          cursor: pointer;
          font-weight: 800;
          text-align: left;
        }

        .download-grid button:hover:not(:disabled) {
          background: #124778;
        }

        .download-grid button:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }

        .boundary-card {
          margin-top: 18px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 14px;
          padding: 16px;
          font-weight: 800;
          line-height: 1.5;
        }

        .note {
          margin-top: 16px;
          font-size: 13px;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          background: #0f172a;
          color: #ffffff;
          padding: 14px 18px;
          border-radius: 14px;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28);
          font-weight: 700;
          z-index: 50;
        }

        @media (max-width: 1100px) {
          .grid,
          .download-grid,
          .flag-list {
            grid-template-columns: repeat(2, 1fr);
          }

          .hero-card {
            flex-direction: column;
          }

          .hero-meta {
            align-items: flex-start;
          }
        }

        @media (max-width: 700px) {
          .details-shell {
            padding: 12px;
          }

          .grid,
          .download-grid,
          .progress-row,
          .flag-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
