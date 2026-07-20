"use client";

import { useEffect, useMemo, useState } from "react";

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

function normalizeArticle(raw: any): ScreeningArticle {
  return {
    hit_id: raw.hit_id || `SCR-${raw.pmid || Date.now()}`,
    pmid: raw.pmid || "—",
    title: raw.title || "—",
    journal: raw.journal || "—",
    publication_date: raw.publication_date || "—",
    product_name:
      raw.product_name || raw.company_suspect_drugs?.[0] || "Not identified",
    country_of_interest: raw.country_of_interest || "Uncertain",
    primary_author: raw.primary_author || "—",
    confidence_score: Number(raw.confidence_score || 0),
    hits_status: raw.hits_status || "completed",
    screening_status: raw.screening_status || "ready",
    intake_status: raw.intake_status || "pending",
    qc_required: Boolean(raw.qc_required || raw.flags?.length),
    company_suspect_drugs: raw.company_suspect_drugs || ["Not identified"],
    active_mah: raw.active_mah || "Unknown",
    co_suspect_drugs: raw.co_suspect_drugs || ["None identified"],
    concomitant_medications: raw.concomitant_medications || ["Not reported"],
    treatment_medications: raw.treatment_medications || ["Not reported"],
    clinical_events: raw.clinical_events || ["Not identified"],
    special_situations: raw.special_situations || ["None identified"],
    event_severity: raw.event_severity || "Not mentioned",
    seriousness: raw.seriousness || "Not mentioned",
    patient_safety: raw.patient_safety || "No",
    patient_identification_pii: raw.patient_identification_pii || "No",
    coi: raw.coi || "Uncertain",
    screening_decision: raw.screening_decision || "Manual Review Required",
    screening_reasoning: raw.screening_reasoning || "",
    evidence_sentence: raw.evidence_sentence || "—",
    flags: raw.flags || [],
    audit_trail: raw.audit_trail || [],
  };
}

export default function ScreeningPage() {
  const [articles, setArticles] = useState<ScreeningArticle[]>([]);
  const [selected, setSelected] = useState<ScreeningArticle | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadScreeningArticles();
  }, []);

  async function loadScreeningArticles() {
    try {
      setLoading(true);

      const response = await fetch("/api/screening/list", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Screening API returned HTTP ${response.status}.`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        showToast("No screening output found.");
        setArticles([]);
        return;
      }

      setArticles(data.map(normalizeArticle));
    } catch {
      showToast("Unable to load screening output.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  const readyArticles = useMemo(() => {
    const query = search.toLowerCase().trim();

    return articles
      .filter((article) => article.screening_status === "ready")
      .filter((article) => {
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

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  function audit(
    action: string,
    oldValue: string,
    newValue: string,
    reason: string,
  ): AuditEvent {
    return {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      module: "Screening",
      action,
      oldValue,
      newValue,
      reason,
      performedBy: "Product Administrator",
      role: "Authorized Reviewer",
    };
  }

  function generateDownstreamOutput(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "GENERATE_DOWNSTREAM_OUTPUT",
      "screening_status: ready | downstream_output: pending",
      "screening_status: completed | downstream_output: ready",
      reason,
    );

    setArticles((previous) =>
      previous.map((article) =>
        article.hit_id === selected.hit_id
          ? {
              ...article,
              screening_status: "completed",
              intake_status: "ready",
              audit_trail: [...article.audit_trail, auditEvent],
            }
          : article,
      ),
    );

    setSelected(null);
    showToast("Governed downstream output marked ready.");
  }

  function excludeArticle(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "EXCLUDE_SCREENING_ARTICLE",
      "screening_status: ready",
      "screening_status: excluded",
      reason,
    );

    setArticles((previous) =>
      previous.map((article) =>
        article.hit_id === selected.hit_id
          ? {
              ...article,
              screening_status: "excluded",
              audit_trail: [...article.audit_trail, auditEvent],
            }
          : article,
      ),
    );

    setSelected(null);
    showToast("Screening article excluded.");
  }

  function saveReview(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "SAVE_SCREENING_REVIEW",
      "draft",
      "saved",
      reason,
    );

    const updated = {
      ...selected,
      audit_trail: [...selected.audit_trail, auditEvent],
    };

    setArticles((previous) =>
      previous.map((article) =>
        article.hit_id === selected.hit_id ? updated : article,
      ),
    );
    setSelected(updated);
    showToast("Screening review saved.");
  }

  function rerunAI(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "RERUN_AI_SCREENING",
      "previous_screening_output",
      "new_screening_output_requested",
      reason,
    );

    const updated = {
      ...selected,
      audit_trail: [...selected.audit_trail, auditEvent],
    };

    setArticles((previous) =>
      previous.map((article) =>
        article.hit_id === selected.hit_id ? updated : article,
      ),
    );
    setSelected(updated);
    showToast("Screening AI re-run requested.");
  }

  const completedCount = articles.filter(
    (article) => article.screening_status === "completed",
  ).length;

  const outputCount = articles.filter(
    (article) => article.intake_status === "ready",
  ).length;

  return (
    <main className="app-shell">
      <InvestorDemoHeader
        title="Human-Governed Screening Intelligence"
        subtitle="Review medically meaningful evidence, verify regulated decision factors and generate a traceable downstream output without hiding the human decision."
      />

      <Navigation />

      <section className="metrics-grid">
        <Metric label="Total Screening Results" value={articles.length} />
        <Metric label="Awaiting Human Review" value={readyArticles.length} tone="warning" />
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
                : `${readyArticles.length} article(s) ready for human screening review`}
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

            <a
              href="/api/screening/export"
              download="clinixai-screening-report.csv"
            >
              Export Screening CSV
            </a>

            <a
              className="primary-action"
              href="/api/screening/export-intake"
              download="clinixai-downstream-output.json"
            >
              Export Downstream Output
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
              {readyArticles.map((article) => (
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
                      Review
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && readyArticles.length === 0 && (
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
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background:
            radial-gradient(circle at 3% 0%, rgba(56, 189, 248, 0.08), transparent 23%),
            #f4f7fb;
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
