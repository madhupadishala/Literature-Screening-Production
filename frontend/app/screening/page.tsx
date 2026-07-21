"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import ScreeningWorkspace from "@/components/ScreeningWorkspace";

type AuditEvent = {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  oldValue: string;
  newValue: string;
  reason: string;
  performedBy: string;
  role: string;
};

export type ScreeningArticle = {
  hit_id: string;
  database_package_id: string;
  screening_result_id?: string;
  intake_export_id?: string;
  review_version: number;
  execution_status: "ready" | "completed" | "failed";
  pmid: string;
  title: string;
  journal: string;
  publication_date: string;
  product_name: string;
  country_of_interest: string;
  primary_author: string;
  confidence_score: number;
  hits_status: string;
  screening_status: "ready" | "completed" | "excluded";
  intake_status: "pending" | "ready";
  qc_required: boolean;
  company_suspect_drugs: string[];
  active_mah: "Yes" | "No" | "Unknown";
  co_suspect_drugs: string[];
  concomitant_medications: string[];
  treatment_medications: string[];
  clinical_events: string[];
  special_situations: string[];
  event_severity: string;
  seriousness: string;
  patient_safety: "Yes" | "No";
  patient_identification_pii: "Yes" | "No";
  coi: "Yes" | "No" | "Uncertain";
  screening_decision: string;
  screening_reasoning: string;
  evidence_sentence: string;
  flags: string[];
  audit_trail: AuditEvent[];
};

function list(value?: string[]) {
  return value?.length ? value.join(", ") : "—";
}

type IncomingScreeningArticle = Record<string, unknown> & {
  findings?: Array<{ rule?: unknown; passed?: unknown; comment?: unknown }>;
  authors?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeArticle(input: unknown): ScreeningArticle {
  const raw = (isRecord(input) ? input : {}) as IncomingScreeningArticle;
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  const decision = stringValue(raw.decision, "REVIEW");
  const reviewStatus = stringValue(raw.reviewStatus, "pending");
  const executionStatus = stringValue(raw.executionStatus, "ready") as
    "ready" | "completed" | "failed";
  const product = stringValue(raw.productName, "Not identified");
  const passedFindings = findings
    .filter((finding) => finding.passed === true)
    .map((finding) => stringValue(finding.rule))
    .filter(Boolean);

  return {
    hit_id: stringValue(raw.screeningResultId) || `SCR-${stringValue(raw.packageId)}`,
    database_package_id: stringValue(raw.packageId),
    screening_result_id: stringValue(raw.screeningResultId) || undefined,
    intake_export_id: stringValue(raw.intakeExportId) || undefined,
    review_version: Number(raw.reviewVersion || 0),
    execution_status: executionStatus,
    pmid: stringValue(raw.pmid, "—"),
    title: stringValue(raw.title, "—"),
    journal: stringValue(raw.journal, "—"),
    publication_date: stringValue(raw.publicationDate, "—"),
    product_name: product,
    country_of_interest: stringValue(raw.countryOfInterest, "Uncertain"),
    primary_author:
      Array.isArray(raw.authors) && raw.authors.length > 0 ? stringValue(raw.authors[0], "—") : "—",
    confidence_score: Number(raw.confidence || 0) / 100,
    hits_status: "completed",
    screening_status:
      reviewStatus === "approved"
        ? "completed"
        : reviewStatus === "excluded"
          ? "excluded"
          : "ready",
    intake_status: stringValue(raw.intakeExportId) ? "ready" : "pending",
    qc_required: Boolean(raw.qcRequired) || executionStatus === "failed",
    company_suspect_drugs: [product],
    active_mah: "Unknown",
    co_suspect_drugs: ["None identified"],
    concomitant_medications: ["Not reported"],
    treatment_medications: ["Not reported"],
    clinical_events: passedFindings.length ? passedFindings : ["Not identified"],
    special_situations: ["None identified"],
    event_severity: "Not mentioned",
    seriousness: "Not mentioned",
    patient_safety: decision === "INCLUDE" ? "Yes" : "No",
    patient_identification_pii: "No",
    coi: "Uncertain",
    screening_decision: decision,
    screening_reasoning: stringValue(raw.reason, "Manual review required."),
    evidence_sentence:
      findings
        .map((finding) => stringValue(finding.comment))
        .filter(Boolean)
        .join(" ") || "—",
    flags: [
      ...(Boolean(raw.qcRequired) ? ["QC required"] : []),
      ...(executionStatus === "failed"
        ? [stringValue(raw.error, "Screening execution failed")]
        : []),
    ],
    audit_trail: [],
  };
}

export default function ScreeningPage() {
  const [articles, setArticles] = useState<ScreeningArticle[]>([]);
  const [selected, setSelected] = useState<ScreeningArticle | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }, []);

  const loadScreeningArticles = useCallback(async () => {
    try {
      setLoading(true);

      const response = await fetch("/api/literature/screening?limit=500", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Screening API returned HTTP ${response.status}.`);
      }

      const data = await response.json();

      if (!Array.isArray(data?.data?.records)) {
        showToast("No screening output found.");
        setArticles([]);
        return;
      }

      setArticles(data.data.records.map(normalizeArticle));
    } catch {
      showToast("Unable to load screening output.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadScreeningArticles(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadScreeningArticles]);

  const visibleArticles = useMemo(() => {
    const query = search.toLowerCase().trim();

    return articles.filter((article) => {
      if (!query) return true;

      return [
        article.pmid,
        article.title,
        article.product_name,
        article.country_of_interest,
        article.primary_author,
        article.screening_decision,
        ...article.company_suspect_drugs,
        ...article.clinical_events,
        ...article.special_situations,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [articles, search]);

  const awaitingReviewCount = articles.filter(
    (article) => article.screening_status === "ready",
  ).length;

  async function generateDownstreamOutput(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before approving this article.");
      return;
    }
    if (await saveReviewMutation("approved", selected.screening_decision, reason)) {
      showToast("Screening decision approved. Intake input remains a separate next-stage action.");
    }
  }

  async function excludeArticle(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before excluding this article.");
      return;
    }
    if (await saveReviewMutation("excluded", "EXCLUDE", reason)) {
      showToast("Screening article excluded.");
    }
  }

  async function saveReview(reason: string) {
    if (!selected) return;
    if (!selected.screening_result_id) {
      showToast("Run Screening AI before saving a review.");
      return;
    }
    if (await saveReviewMutation("flagged", "REVIEW", reason)) {
      showToast("Screening review saved.");
    }
  }

  async function rerunAI(reason: string) {
    if (!selected) return;
    const response = await fetch("/api/literature/screening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "execute",
        input: { packageId: selected.database_package_id, reason },
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      showToast(payload?.error || "Screening AI execution failed.");
      return;
    }
    await loadScreeningArticles();
    setSelected(normalizeArticle(payload.data));
    showToast("Screening AI execution completed and routed to human review.");
  }

  async function generateIntakeInput(reason: string) {
    if (!selected) return;
    const response = await fetch("/api/literature/intake-input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId: selected.database_package_id, reason }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      showToast(payload?.error || "intake_input.json could not be generated.");
      return;
    }
    await loadScreeningArticles();
    setSelected(null);
    window.location.assign(`/api/literature/intake-input/${payload.data.exportId}`);
    showToast(
      payload.data.reused
        ? "Existing governed intake_input.json downloaded."
        : "Governed intake_input.json generated and downloaded.",
    );
  }

  async function saveReviewMutation(
    status: "approved" | "excluded" | "flagged",
    finalDecision: string,
    comments: string,
  ): Promise<boolean> {
    if (!selected?.screening_result_id) return false;
    const response = await fetch("/api/literature/screening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        input: {
          packageId: selected.database_package_id,
          screeningResultId: selected.screening_result_id,
          status,
          finalDecision,
          comments,
          expectedVersion: selected.review_version,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
      showToast(payload?.error || "Screening review could not be saved.");
      return false;
    }
    await loadScreeningArticles();
    setSelected(null);
    return true;
  }

  const completedCount = articles.filter(
    (article) => article.screening_status === "completed",
  ).length;

  const outputCount = articles.filter((article) => article.intake_status === "ready").length;

  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        title="Human-Governed Screening Intelligence"
        subtitle="Review medically meaningful evidence, verify regulated decision factors and generate a traceable downstream output without hiding the human decision."
      />

      <section className="metrics-grid">
        <Metric label="Total Screening Results" value={articles.length} />
        <Metric label="Awaiting Human Review" value={awaitingReviewCount} tone="warning" />
        <Metric label="Completed Reviews" value={completedCount} tone="success" />
        <Metric label="Downstream Outputs" value={outputCount} tone="primary" />
        <Metric
          label="Serious Findings"
          value={articles.filter((article) => article.seriousness === "Serious").length}
          tone="critical"
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-kicker">Medical review worklist</span>
            <h2>Screening Decisions</h2>
            <p>
              {loading
                ? "Loading governed screening results…"
                : `${awaitingReviewCount} article(s) awaiting review; ${outputCount} downstream output(s) ready`}
            </p>
          </div>

          <div className="panel-actions">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search PMID, product, event…"
              aria-label="Search screening worklist"
            />

            <button type="button" onClick={() => void loadScreeningArticles()}>
              Refresh
            </button>

            <a href="/api/screening/export" download="clinixai-screening-report.csv">
              Export Screening CSV
            </a>
          </div>
        </div>

        <div className="filters-row" aria-label="Screening filters">
          <button type="button">Product</button>
          <button type="button">Active MAH</button>
          <button type="button">COI</button>
          <button type="button">Seriousness</button>
          <button type="button">Special Situation</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>QC</th>
                <th>PMID</th>
                <th>Product</th>
                <th>Country</th>
                <th>Reporter</th>
                <th>Company Suspect</th>
                <th>Active MAH</th>
                <th>Clinical Event</th>
                <th>Seriousness</th>
                <th>PII</th>
                <th>COI</th>
                <th>Decision</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {visibleArticles.map((article) => (
                <tr key={article.hit_id}>
                  <td>
                    <span className={`qc-badge ${article.qc_required ? "required" : ""}`}>
                      {article.qc_required ? "QC" : "Pass"}
                    </span>
                  </td>
                  <td className="mono">{article.pmid}</td>
                  <td>
                    <strong>{article.product_name}</strong>
                    <small>{article.hits_status}</small>
                  </td>
                  <td>{article.country_of_interest}</td>
                  <td>{article.primary_author}</td>
                  <td>{list(article.company_suspect_drugs)}</td>
                  <td>{article.active_mah}</td>
                  <td>{list(article.clinical_events)}</td>
                  <td>{article.seriousness}</td>
                  <td>{article.patient_identification_pii}</td>
                  <td>{article.coi}</td>
                  <td>
                    <span className="decision">{article.screening_decision}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="review-button"
                      onClick={() => {
                        setSelected(article);
                        setActiveTab("Overview");
                      }}
                    >
                      {article.intake_status === "ready"
                        ? "Download"
                        : article.screening_status === "completed"
                          ? "Generate"
                          : "Review"}
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && visibleArticles.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty">
                    No screening results match the current search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <ScreeningWorkspace
          article={selected}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSelected(null)}
          onApprove={generateDownstreamOutput}
          onExclude={excludeArticle}
          onSave={saveReview}
          onRerunAI={rerunAI}
          onGenerateIntakeInput={generateIntakeInput}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background:
            radial-gradient(circle at 3% 0%, rgba(56, 189, 248, 0.08), transparent 23%), #f4f7fb;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 18px;
        }

        .panel {
          overflow: hidden;
          border: 1px solid #dbe4ef;
          border-radius: 21px;
          background: #ffffff;
          box-shadow: 0 12px 34px rgba(15, 23, 42, 0.06);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          padding: 23px 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .section-kicker {
          color: #1d4ed8;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .panel-header h2 {
          margin: 5px 0;
          font-size: 22px;
          letter-spacing: -0.02em;
        }

        .panel-header p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .panel-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .panel-actions input {
          min-width: 230px;
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          outline: none;
          font: inherit;
          font-size: 11px;
        }

        .panel-actions input:focus {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.1);
        }

        .panel-actions button,
        .panel-actions a {
          display: inline-flex;
          align-items: center;
          min-height: 36px;
          padding: 8px 11px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          color: #334155;
          background: #ffffff;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
        }

        .panel-actions .primary-action {
          border-color: #1d4ed8;
          color: #ffffff;
          background: #1d4ed8;
        }

        .filters-row {
          display: flex;
          gap: 8px;
          padding: 12px 18px;
          overflow-x: auto;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .filters-row button {
          border: 1px solid #dbe4ef;
          border-radius: 999px;
          padding: 7px 10px;
          color: #475569;
          background: #ffffff;
          font: inherit;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .table-wrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          min-width: 1480px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 13px 14px;
          border-bottom: 1px solid #e8eef5;
          text-align: left;
          vertical-align: middle;
          font-size: 11px;
        }

        th {
          color: #64748b;
          background: #ffffff;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        tbody tr:hover {
          background: #f8fbff;
        }

        td strong,
        td small {
          display: block;
        }

        td small {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 9px;
        }

        .mono {
          color: #1e3a8a;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-weight: 800;
        }

        .qc-badge,
        .decision {
          display: inline-flex;
          padding: 6px 8px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .qc-badge.required {
          color: #92400e;
          background: #fef3c7;
        }

        .decision {
          color: #1e40af;
          background: #dbeafe;
        }

        .review-button {
          border: 0;
          border-radius: 9px;
          padding: 8px 10px;
          color: #ffffff;
          background: #1d4ed8;
          font: inherit;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .empty {
          padding: 38px;
          color: #64748b;
          text-align: center;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 70;
          max-width: 460px;
          padding: 14px 18px;
          border-radius: 14px;
          color: #ffffff;
          background: #0f172a;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
          font-size: 12px;
          font-weight: 700;
        }

        @media (max-width: 1200px) {
          .metrics-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .panel-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .panel-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid {
            grid-template-columns: 1fr 1fr;
          }

          .panel-actions input {
            width: 100%;
            min-width: 0;
          }
        }

        @media (max-width: 440px) {
          .metrics-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "success" | "primary" | "critical";
}) {
  return (
    <article className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>

      <style jsx>{`
        .metric {
          min-height: 102px;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 17px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
        }

        span {
          display: block;
          min-height: 31px;
          color: #64748b;
          font-size: 10px;
          line-height: 1.35;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.045em;
        }

        strong {
          display: block;
          margin-top: 8px;
          color: #0f172a;
          font-size: 27px;
        }

        .warning {
          border-color: #fde68a;
          background: #fffdf5;
        }

        .success {
          border-color: #bbf7d0;
          background: #f7fff9;
        }

        .primary {
          border-color: #bfdbfe;
          background: #f8fbff;
        }

        .critical {
          border-color: #fecaca;
          background: #fff8f8;
        }
      `}</style>
    </article>
  );
}
