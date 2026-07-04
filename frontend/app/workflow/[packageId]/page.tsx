"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkflowState = {
  state?: string;
  updated_at?: string;
  updatedAt?: string;
  package_id?: string;
  packageId?: string;
};

type WorkflowPackage = {
  packageId?: string;
  id?: string;
  pmid?: string;
  title?: string;
  metadata?: Record<string, any>;
  workflowState?: WorkflowState;
  workflow_state?: WorkflowState;
  hitsOutput?: any;
  hits_output?: any;
  screeningOutput?: any;
  screening_output?: any;
  intakeInput?: any;
  intake_input?: any;
};

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

function findValue(obj: any, keys: string[]) {
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

function countItems(value: any) {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object") return Object.keys(value).length;
  return 1;
}

function getPackageId(pkg: WorkflowPackage) {
  return pkg.packageId || pkg.package_id || pkg.id || "";
}

function getState(pkg: WorkflowPackage) {
  return pkg.workflowState || pkg.workflow_state || {};
}

function getHits(pkg: WorkflowPackage) {
  return pkg.hitsOutput || pkg.hits_output || {};
}

function getScreening(pkg: WorkflowPackage) {
  return pkg.screeningOutput || pkg.screening_output || {};
}

function getIntake(pkg: WorkflowPackage) {
  return pkg.intakeInput || pkg.intake_input || {};
}

function StatusBadge({ state }: { state: string }) {
  return <span className={`status-badge ${state.toLowerCase()}`}>{STATUS_LABELS[state] || state}</span>;
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

export default function WorkflowDetailsPage({ params }: { params: { packageId: string } }) {
  const packageId = decodeURIComponent(params.packageId);
  const [activeTab, setActiveTab] = useState("Overview");
  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPackages() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load workflow package.");

      const data = await response.json();
      const items = Array.isArray(data) ? data : data.packages || data.items || [];
      setPackages(items);
    } catch (err: any) {
      setError(err?.message || "Unable to load workflow package.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPackages();
  }, []);

  const pkg = useMemo(() => {
    return packages.find((item) => getPackageId(item) === packageId);
  }, [packages, packageId]);

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
          <Link href="/workflow" className="back-link">← Back to Workflow</Link>
          <h1>Package not found</h1>
          <p>{error || `No package found for ${packageId}.`}</p>
        </div>
      </main>
    );
  }

  const state = getState(pkg);
  const hits = getHits(pkg);
  const screening = getScreening(pkg);
  const intake = getIntake(pkg);
  const metadata = pkg.metadata || {};

  const currentState = text(state.state, "NEW");
  const title = text(pkg.title || findValue(metadata, ["title", "article_title"]));
  const pmid = text(pkg.pmid || findValue(metadata, ["pmid", "PMID"]));

  const journal = findValue(metadata, ["journal", "journal_title"]);
  const authors = findValue(metadata, ["authors", "author", "primary_author"]);
  const country = findValue(metadata, ["country", "patient_country", "coi_country"]);
  const abstract = findValue(metadata, ["abstract", "article_abstract"]);
  const fullText = findValue(metadata, ["full_text_available", "fullTextAvailable", "full_text"]);

  const products = findValue(hits, ["products", "detected_products", "product_hits", "suspect_products"]);
  const validity = findValue(screening, ["validity", "case_validity", "is_valid"]);
  const seriousness = findValue(screening, ["seriousness", "serious", "seriousness_assessment"]);
  const patient = findValue(screening, ["patient", "patient_identifier", "patient_details"]);
  const reporter = findValue(screening, ["reporter", "primary_reporter", "author"]);
  const adverseEvent = findValue(screening, ["adverse_event", "ae", "event", "events"]);
  const narrative = findValue(screening, ["narrative", "case_narrative", "summary"]);

  const progress = [
    { label: "Hits", done: countItems(hits) > 0 || ["HITS_COMPLETE", "SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(currentState) },
    { label: "Screening", done: countItems(screening) > 0 || ["SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(currentState) },
    { label: "Intake", done: countItems(intake) > 0 || currentState === "INTAKE_INPUT_CREATED" },
  ];

  return (
    <main className="details-shell">
      <div className="hero-card">
        <div>
          <Link href="/workflow" className="back-link">← Back to Workflow</Link>
          <h1>{packageId}</h1>
          <p>{title}</p>
        </div>
        <div className="hero-meta">
          <StatusBadge state={currentState} />
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

          <div className="grid">
            <Field label="Package ID" value={packageId} />
            <Field label="PMID" value={pmid} />
            <Field label="Current State" value={STATUS_LABELS[currentState] || currentState} />
            <Field label="Last Updated" value={state.updated_at || state.updatedAt} />
            <Field label="Hits Available" value={countItems(hits)} />
            <Field label="Screening Available" value={countItems(screening)} />
            <Field label="Intake Created" value={countItems(intake) > 0 ? "Yes" : "No"} />
            <Field label="Patient Country" value={country} />
          </div>
        </>
      )}

      {activeTab === "Evidence" && (
        <Section title="Evidence Package">
          <div className="grid">
            <Field label="Article Title" value={title} />
            <Field label="Journal" value={journal} />
            <Field label="Authors" value={authors} />
            <Field label="Country" value={country} />
            <Field label="Full Text Availability" value={fullText} />
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
            <Field label="Product Detections" value={countItems(products)} />
            <Field label="Total Hit Objects" value={countItems(hits)} />
            <Field label="Suspect Products" value={findValue(hits, ["suspect_products", "company_suspects"])} />
            <Field label="Confidence" value={findValue(hits, ["confidence", "ai_confidence"])} />
          </div>
          <div className="text-panel">
            <h3>Detected Products / Signals</h3>
            <p>{text(products, "No product hits detected yet.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Screening" && (
        <Section title="Screening Output">
          <div className="grid">
            <Field label="Validity" value={validity} />
            <Field label="Seriousness" value={seriousness} />
            <Field label="Patient" value={patient} />
            <Field label="Primary Reporter" value={reporter} />
            <Field label="Adverse Event" value={adverseEvent} />
            <Field label="Country of Interest" value={country} />
          </div>
          <div className="text-panel">
            <h3>Narrative Preview</h3>
            <p>{text(narrative, "No screening narrative available yet.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Intake" && (
        <Section title="Intake Package">
          <div className="grid">
            <Field label="Intake Package Created" value={countItems(intake) > 0 ? "Yes" : "No"} />
            <Field label="Source" value="Literature Screening V1" />
            <Field label="Export Boundary" value="intake_input.json" />
            <Field label="Next Step" value="STOP - PV Nexus handles future intake processing" />
          </div>
          <div className="text-panel">
            <h3>Human-Readable Intake Summary</h3>
            <p>
              {countItems(intake) > 0
                ? "The intake input package has been created successfully. This is the final output of ClinixAI Literature Screening V1."
                : "Intake input has not been created yet."}
            </p>
          </div>
        </Section>
      )}

      {activeTab === "Audit" && (
        <Section title="Audit Trail">
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
                <p>{progress[2].done ? "intake_input.json created. Literature module stops here." : "Intake input not created yet."}</p>
              </div>
            </div>
          </div>
        </Section>
      )}

      {activeTab === "Download" && (
        <Section title="Download Package Outputs">
          <div className="download-grid">
            <button disabled={!metadata}>Evidence Package</button>
            <button disabled={!countItems(hits)}>Hits Output</button>
            <button disabled={!countItems(screening)}>Screening Output</button>
            <button disabled={!countItems(intake)}>Intake Input</button>
          </div>
          <p className="note">
            Download actions can be connected after the details page visual review is stable.
          </p>
        </Section>
      )}

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
        }

        .tabs button.active {
          background: #185a9d;
          color: #ffffff;
        }

        .section-card,
        .panel {
          padding: 28px;
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
          grid-template-columns: repeat(4, 1fr);
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
        }

        .download-grid button:disabled {
          background: #cbd5e1;
          cursor: not-allowed;
        }

        .note {
          margin-top: 16px;
          font-size: 13px;
        }

        @media (max-width: 1100px) {
          .grid,
          .download-grid {
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
          .progress-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}