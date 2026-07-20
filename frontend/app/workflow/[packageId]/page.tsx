"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

type WorkflowState = {
  state?: string;
  updated_at?: string;
  updatedAt?: string;
  package_id?: string;
  packageId?: string;
};

type WorkflowPackage = {
  packageId?: string;
  package_id?: string;
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
  INTAKE_INPUT_CREATED: "Downstream Output Ready",
};

const tabs = [
  "Overview",
  "Evidence",
  "Hits",
  "Screening",
  "Downstream Output",
  "Audit",
  "Download",
];

function text(value: any, fallback = "â€”") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

function getDownstreamOutput(pkg: WorkflowPackage) {
  return pkg.intakeInput || pkg.intake_input || {};
}

export default function WorkflowDetailsPage() {
  const params = useParams<{ packageId: string | string[] }>();

  const rawPackageId = Array.isArray(params.packageId)
    ? params.packageId[0]
    : params.packageId;

  const packageId = decodeURIComponent(rawPackageId || "");
  const [activeTab, setActiveTab] = useState("Overview");
  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/workflow/list", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load the evidence package.");
      }

      const data = await response.json();
      setPackages(Array.isArray(data) ? data : data.packages || data.items || []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load the evidence package.",
      );
    } finally {
      setLoading(false);
    }
  }

  const pkg = useMemo(
    () => packages.find((item) => getPackageId(item) === packageId),
    [packages, packageId],
  );

  if (loading) {
    return (
      <main className="details-shell">
        <div className="loading-card">Loading governed evidence packageâ€¦</div>
      </main>
    );
  }

  if (error || !pkg) {
    return (
      <main className="details-shell">
        <div className="loading-card">
          <Link href="/workflow" className="back-link">
            â† Back to Workflow
          </Link>
          <h1>Evidence package not found</h1>
          <p>{error || `No package was found for ${packageId}.`}</p>
        </div>
      </main>
    );
  }

  const state = getState(pkg);
  const hits = getHits(pkg);
  const screening = getScreening(pkg);
  const downstreamOutput = getDownstreamOutput(pkg);
  const metadata = pkg.metadata || {};

  const currentState = text(state.state, "NEW");
  const title = text(
    pkg.title || findValue(metadata, ["title", "article_title"]),
  );
  const pmid = text(pkg.pmid || findValue(metadata, ["pmid", "PMID"]));
  const journal = findValue(metadata, ["journal", "journal_title"]);
  const authors = findValue(metadata, ["authors", "author", "primary_author"]);
  const country = findValue(metadata, [
    "country",
    "patient_country",
    "coi_country",
  ]);
  const abstract = findValue(metadata, ["abstract", "article_abstract"]);
  const fullText = findValue(metadata, [
    "full_text_available",
    "fullTextAvailable",
    "full_text",
  ]);

  const products = findValue(hits, [
    "products",
    "detected_products",
    "product_hits",
    "suspect_products",
  ]);
  const validity = findValue(screening, [
    "validity",
    "case_validity",
    "is_valid",
  ]);
  const seriousness = findValue(screening, [
    "seriousness",
    "serious",
    "seriousness_assessment",
  ]);
  const patient = findValue(screening, [
    "patient",
    "patient_identifier",
    "patient_details",
  ]);
  const reporter = findValue(screening, [
    "reporter",
    "primary_reporter",
    "primary_author",
    "author",
  ]);
  const adverseEvent = findValue(screening, [
    "adverse_event",
    "ae",
    "event",
    "events",
    "clinical_events",
  ]);
  const narrative = findValue(screening, [
    "narrative",
    "case_narrative",
    "summary",
    "screening_reasoning",
  ]);

  const downstreamCount =
    Number(downstreamOutput.intake_input_count || 0) ||
    countItems(downstreamOutput.intake_inputs);

  const progress = [
    {
      label: "Hits",
      done:
        countItems(hits) > 0 ||
        ["HITS_COMPLETE", "SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(
          currentState,
        ),
    },
    {
      label: "Screening",
      done:
        countItems(screening) > 0 ||
        ["SCREENING_COMPLETE", "INTAKE_INPUT_CREATED"].includes(currentState),
    },
    {
      label: "Downstream Output",
      done: downstreamCount > 0 || currentState === "INTAKE_INPUT_CREATED",
    },
  ];

  return (
    <main className="details-shell">
      <InvestorDemoHeader
        eyebrow="GOVERNED EVIDENCE PACKAGE"
        title={title}
        subtitle={`Package ${packageId} Â· PMID ${pmid} Â· Every output remains connected to source evidence and workflow state.`}
      />

      <Navigation />

      <div className="package-toolbar">
        <Link href="/workflow" className="back-link">
          â† Back to Workflow
        </Link>
        <StatusBadge state={currentState} />
      </div>

      <nav className="tabs" aria-label="Evidence package sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <>
          <Section title="Workflow Progress">
            <div className="progress-row">
              {progress.map((step) => (
                <div
                  key={step.label}
                  className={`progress-step ${step.done ? "done" : ""}`}
                >
                  <span>{step.done ? "âœ“" : "â—‹"}</span>
                  <strong>{step.label}</strong>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid overview-grid">
            <Field label="Package ID" value={packageId} />
            <Field label="PMID" value={pmid} />
            <Field
              label="Current State"
              value={STATUS_LABELS[currentState] || currentState}
            />
            <Field
              label="Last Updated"
              value={state.updated_at || state.updatedAt}
            />
            <Field label="Hits Objects" value={countItems(hits)} />
            <Field label="Screening Objects" value={countItems(screening)} />
            <Field label="Downstream Outputs" value={downstreamCount} />
            <Field label="Country of Interest" value={country} />
          </div>
        </>
      )}

      {activeTab === "Evidence" && (
        <Section title="Evidence Package">
          <div className="grid">
            <Field label="Article Title" value={title} />
            <Field label="Journal" value={journal} />
            <Field label="Authors / Reporters" value={authors} />
            <Field label="Country" value={country} />
            <Field label="Full Text Availability" value={fullText} />
          </div>

          <div className="text-panel">
            <span>Source abstract</span>
            <p>{text(abstract, "No abstract is available in this package.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Hits" && (
        <Section title="Hits Intelligence">
          <div className="grid">
            <Field label="Product Detections" value={countItems(products)} />
            <Field label="Total Hits Objects" value={countItems(hits)} />
            <Field
              label="Company Suspect Products"
              value={findValue(hits, [
                "suspect_products",
                "company_suspects",
                "company_suspect_drugs",
              ])}
            />
            <Field
              label="AI Confidence"
              value={findValue(hits, ["confidence", "ai_confidence"])}
            />
            <Field
              label="Primary Reporter"
              value={findValue(hits, ["primary_author", "reporter"])}
            />
            <Field
              label="Active MAH"
              value={findValue(hits, ["active_mah", "mah_active"])}
            />
          </div>

          <div className="text-panel">
            <span>Detected products and signals</span>
            <p>{text(products, "No product hits have been detected.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Screening" && (
        <Section title="Screening Intelligence">
          <div className="grid">
            <Field label="Validity" value={validity} />
            <Field label="Seriousness" value={seriousness} />
            <Field label="Patient" value={patient} />
            <Field label="Primary Reporter" value={reporter} />
            <Field label="Clinical Event" value={adverseEvent} />
            <Field label="Country of Interest" value={country} />
            <Field
              label="Active MAH"
              value={findValue(screening, ["active_mah", "mah_active"])}
            />
            <Field
              label="PII"
              value={findValue(screening, [
                "patient_identification_pii",
                "pii_detected",
              ])}
            />
            <Field
              label="Screening Decision"
              value={findValue(screening, [
                "screening_decision",
                "decision",
              ])}
            />
          </div>

          <div className="text-panel">
            <span>Screening reasoning</span>
            <p>{text(narrative, "No screening reasoning is available.")}</p>
          </div>
        </Section>
      )}

      {activeTab === "Downstream Output" && (
        <Section title="Governed Downstream Output">
          <div className="boundary-panel">
            <div>
              <span>Literature product boundary</span>
              <strong>intake_input.json</strong>
            </div>
            <p>
              This file is the final governed output of Literature Intelligence.
              Case booking, case processing, QC and submission are handled by
              separate Nexus workspaces.
            </p>
          </div>

          <div className="grid">
            <Field
              label="Output Generated"
              value={downstreamCount > 0 ? "Yes" : "No"}
            />
            <Field label="Output Records" value={downstreamCount} />
            <Field label="Source Workspace" value="Literature Intelligence" />
            <Field label="Module Boundary" value="STOP" />
            <Field
              label="Company Suspect Drugs"
              value={findValue(downstreamOutput, [
                "company_suspect_drugs",
                "suspect_product",
              ])}
            />
            <Field
              label="Clinical Events"
              value={findValue(downstreamOutput, [
                "clinical_events",
                "events",
              ])}
            />
            <Field
              label="Special Situations"
              value={findValue(downstreamOutput, ["special_situations"])}
            />
            <Field
              label="Active MAH"
              value={findValue(downstreamOutput, ["active_mah"])}
            />
          </div>
        </Section>
      )}

      {activeTab === "Audit" && (
        <Section title="Decision Audit Trail">
          <div className="timeline">
            <TimelineItem
              done
              title="Evidence package created"
              detail="Source metadata and evidence were placed in a governed package."
            />
            <TimelineItem
              done={progress[0].done}
              title="Hits intelligence"
              detail={
                progress[0].done
                  ? "Product-aware Hits output is available."
                  : "Hits processing is pending."
              }
            />
            <TimelineItem
              done={progress[1].done}
              title="Screening intelligence"
              detail={
                progress[1].done
                  ? "Medical screening output is available."
                  : "Screening processing is pending."
              }
            />
            <TimelineItem
              done={progress[2].done}
              title="Downstream output builder"
              detail={
                progress[2].done
                  ? "intake_input.json is available. Literature processing stops here."
                  : "The downstream output has not been generated."
              }
            />
          </div>
        </Section>
      )}

      {activeTab === "Download" && (
        <Section title="Download Governed Outputs">
          <div className="download-grid">
            <DownloadLink
              href={`/api/workflow/download/${encodeURIComponent(
                packageId,
              )}/hits_output`}
              enabled={countItems(hits) > 0}
              label="Hits Output"
            />
            <DownloadLink
              href={`/api/workflow/download/${encodeURIComponent(
                packageId,
              )}/screening_output`}
              enabled={countItems(screening) > 0}
              label="Screening Output"
            />
            <DownloadLink
              href={`/api/workflow/download/${encodeURIComponent(
                packageId,
              )}/intake_input`}
              enabled={downstreamCount > 0}
              label="Downstream Output"
            />
          </div>

          <p className="note">
            Downloads are generated from the governed evidence package. The
            internal downstream filename remains <strong>intake_input.json</strong>.
          </p>
        </Section>
      )}

      <style jsx>{`
        .details-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background:
            radial-gradient(circle at 3% 0%, rgba(56, 189, 248, 0.08), transparent 23%),
            #f4f7fb;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .loading-card,
        .section-card {
          padding: 26px;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .package-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 0 0 14px;
          padding: 0 4px;
        }

        .back-link {
          color: #1d4ed8;
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
        }

        .tabs {
          display: flex;
          gap: 7px;
          margin: 0 0 18px;
          padding: 8px;
          overflow-x: auto;
          border: 1px solid #dbe4ef;
          border-radius: 16px;
          background: #ffffff;
        }

        .tabs button {
          border: 0;
          border-radius: 10px;
          padding: 10px 13px;
          color: #475569;
          background: transparent;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
        }

        .tabs button.active {
          color: #ffffff;
          background: #1d4ed8;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(170px, 1fr));
          gap: 12px;
        }

        .overview-grid {
          margin-top: 16px;
        }

        .progress-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .progress-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          color: #475569;
          background: #f8fafc;
        }

        .progress-step span {
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 999px;
          background: #e2e8f0;
          font-weight: 900;
        }

        .progress-step strong {
          font-size: 11px;
        }

        .progress-step.done {
          border-color: #bbf7d0;
          color: #166534;
          background: #f0fdf4;
        }

        .progress-step.done span {
          color: #ffffff;
          background: #16a34a;
        }

        .text-panel,
        .boundary-panel {
          margin-top: 15px;
          padding: 16px;
          border-radius: 14px;
        }

        .text-panel {
          border: 1px solid #dbeafe;
          background: #f8fbff;
        }

        .text-panel span,
        .boundary-panel span {
          display: block;
          margin-bottom: 6px;
          color: #1d4ed8;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        .text-panel p,
        .boundary-panel p {
          margin: 0;
          color: #475569;
          font-size: 12px;
          line-height: 1.7;
        }

        .boundary-panel {
          display: flex;
          align-items: center;
          gap: 24px;
          margin: 0 0 16px;
          border: 1px solid #bae6fd;
          background: #f0f9ff;
        }

        .boundary-panel div {
          min-width: 190px;
        }

        .boundary-panel strong {
          color: #0c4a6e;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 14px;
        }

        .timeline {
          display: grid;
          gap: 10px;
        }

        .download-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .note {
          margin: 14px 0 0;
          color: #64748b;
          font-size: 11px;
          line-height: 1.6;
        }

        @media (max-width: 1100px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .boundary-panel {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 700px) {
          .details-shell {
            padding: 12px;
          }

          .grid,
          .progress-row,
          .download-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function StatusBadge({ state }: { state: string }) {
  return (
    <span className={`status-badge ${state.toLowerCase()}`}>
      {STATUS_LABELS[state] || state}

      <style jsx>{`
        .status-badge {
          display: inline-flex;
          padding: 7px 10px;
          border-radius: 999px;
          color: #475569;
          background: #eef2f7;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hits_running,
        .screening_running {
          color: #075985;
          background: #e0f2fe;
        }

        .hits_complete {
          color: #155e75;
          background: #cffafe;
        }

        .screening_complete {
          color: #6b21a8;
          background: #f3e8ff;
        }

        .intake_input_created {
          color: #166534;
          background: #dcfce7;
        }
      `}</style>
    </span>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="field-card">
      <span>{label}</span>
      <strong>{text(value)}</strong>

      <style jsx>{`
        .field-card {
          min-height: 82px;
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          background: #fbfdff;
        }

        span {
          display: block;
          margin-bottom: 7px;
          color: #64748b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.045em;
          text-transform: uppercase;
        }

        strong {
          display: block;
          color: #0f172a;
          font-size: 11px;
          line-height: 1.55;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section-card">
      <h2>{title}</h2>
      {children}

      <style jsx>{`
        .section-card {
          padding: 24px;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          background: #ffffff;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        h2 {
          margin: 0 0 18px;
          font-size: 20px;
          letter-spacing: -0.02em;
        }
      `}</style>
    </section>
  );
}

function TimelineItem({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <article className={done ? "done" : ""}>
      <span />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>

      <style jsx>{`
        article {
          display: flex;
          gap: 12px;
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 13px;
          background: #f8fafc;
        }

        article > span {
          width: 12px;
          height: 12px;
          margin-top: 3px;
          border-radius: 999px;
          background: #cbd5e1;
          flex: 0 0 auto;
        }

        article.done {
          border-color: #bbf7d0;
          background: #f7fff9;
        }

        article.done > span {
          background: #16a34a;
        }

        strong {
          display: block;
          margin-bottom: 4px;
          font-size: 11px;
        }

        p {
          margin: 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
        }
      `}</style>
    </article>
  );
}

function DownloadLink({
  href,
  enabled,
  label,
}: {
  href: string;
  enabled: boolean;
  label: string;
}) {
  if (!enabled) {
    return <span className="download disabled">{label} unavailable</span>;
  }

  return (
    <a className="download" href={href}>
      Download {label}

      <style jsx>{`
        .download {
          display: grid;
          min-height: 66px;
          place-items: center;
          padding: 12px;
          border-radius: 13px;
          color: #ffffff;
          background: #1d4ed8;
          font-size: 10px;
          font-weight: 900;
          text-align: center;
          text-decoration: none;
        }
      `}</style>
    </a>
  );
}
