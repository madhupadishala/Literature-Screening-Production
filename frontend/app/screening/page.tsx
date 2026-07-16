"use client";

import { useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";
import ScreeningWorkspace from "../../components/ScreeningWorkspace";

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
  return value && value.length ? value.join(", ") : "—";
}

function normalizeArticle(raw: any): ScreeningArticle {
  return {
    hit_id: raw.hit_id || `SCR-${raw.pmid || Date.now()}`,
    pmid: raw.pmid || "—",
    title: raw.title || "—",
    journal: raw.journal || "—",
    publication_date: raw.publication_date || "—",
    product_name: raw.product_name || raw.company_suspect_drugs?.[0] || "Not identified",
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
    loadScreeningArticles();
  }, []);

  async function loadScreeningArticles() {
    try {
      setLoading(true);
      const response = await fetch("/api/screening/list", { cache: "no-store" });
      const data = await response.json();

      if (!Array.isArray(data)) {
        showToast("No screening output found.");
        setArticles([]);
        return;
      }

      setArticles(data.map(normalizeArticle));
    } catch {
      showToast("Failed to load screening output.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  const readyArticles = useMemo(() => {
    const q = search.toLowerCase().trim();

    return articles
      .filter((a) => a.screening_status === "ready")
      .filter((a) => {
        if (!q) return true;

        return [
          a.pmid,
          a.title,
          a.product_name,
          a.country_of_interest,
          a.primary_author,
          a.screening_decision,
          ...a.company_suspect_drugs,
          ...a.clinical_events,
          ...a.special_situations,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [articles, search]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  function audit(action: string, oldValue: string, newValue: string, reason: string): AuditEvent {
    return {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      module: "Screening Review",
      action,
      oldValue,
      newValue,
      reason,
      performedBy: "Madhu",
      role: "Super User",
    };
  }

  function approveToIntake(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "APPROVE_SCREENING_OUTPUT",
      "screening_status: ready | intake_status: pending",
      "screening_status: completed | intake_status: ready",
      reason
    );

    setArticles((prev) =>
      prev.map((a) =>
        a.hit_id === selected.hit_id
          ? {
              ...a,
              screening_status: "completed",
              intake_status: "ready",
              audit_trail: [...a.audit_trail, auditEvent],
            }
          : a
      )
    );

    setSelected(null);
    showToast("Screening output approved.");
  }

  function excludeArticle(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "EXCLUDE_SCREENING_ARTICLE",
      "screening_status: ready",
      "screening_status: excluded",
      reason
    );

    setArticles((prev) =>
      prev.map((a) =>
        a.hit_id === selected.hit_id
          ? {
              ...a,
              screening_status: "excluded",
              audit_trail: [...a.audit_trail, auditEvent],
            }
          : a
      )
    );

    setSelected(null);
    showToast("Screening article excluded.");
  }

  function saveReview(reason: string) {
    if (!selected) return;

    const auditEvent = audit("SAVE_SCREENING_REVIEW", "draft", "saved", reason);

    const updated = {
      ...selected,
      audit_trail: [...selected.audit_trail, auditEvent],
    };

    setArticles((prev) => prev.map((a) => (a.hit_id === selected.hit_id ? updated : a)));
    setSelected(updated);
    showToast("Screening review saved.");
  }

  function rerunAI(reason: string) {
    if (!selected) return;

    const auditEvent = audit(
      "RERUN_AI_SCREENING",
      "previous_screening_output",
      "new_screening_output_requested",
      reason
    );

    const updated = {
      ...selected,
      audit_trail: [...selected.audit_trail, auditEvent],
    };

    setArticles((prev) => prev.map((a) => (a.hit_id === selected.hit_id ? updated : a)));
    setSelected(updated);
    showToast("AI re-run requested.");
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>ClinixAI</h1>
          <p>Literature Screening Review</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total Screening</span>
          <strong>{articles.length}</strong>
        </div>

        <div className="metric-card warning">
          <span>Ready for Review</span>
          <strong>{readyArticles.length}</strong>
        </div>

        <div className="metric-card success">
          <span>Completed</span>
          <strong>{articles.filter((a) => a.screening_status === "completed").length}</strong>
        </div>

        <div className="metric-card">
          <span>Intake Input Ready</span>
          <strong>{articles.filter((a) => a.intake_status === "ready").length}</strong>
        </div>

        <div className="metric-card warning">
          <span>Serious</span>
          <strong>{articles.filter((a) => a.seriousness === "Serious").length}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Screening Review Worklist</h2>
            <p>
              {loading
                ? "Loading screening output..."
                : `${readyArticles.length} article(s) ready for screening review`}
            </p>
          </div>

          <div className="panel-actions">
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PMID, product, event..."
            />

            <button onClick={loadScreeningArticles}>Refresh</button>

            <a
              className="primary-action"
              href="/api/screening/export"
              download="clinixai-screening-report.csv"
            >
              Export CSV
            </a>

            <a
              className="primary-action"
              href="/api/screening/export-intake"
              download="clinixai-intake-input-package.json"
            >
              Export Intake Package
            </a>
          </div>
        </div>

        <div className="filters-row">
          <button>Product ▾</button>
          <button>MAH ▾</button>
          <button>COI ▾</button>
          <button>Seriousness ▾</button>
          <button>Special Situation ▾</button>
        </div>

        <div className="table-wrap">
          <table className="hits-table">
            <thead>
              <tr>
                <th>QC</th>
                <th>PMID</th>
                <th>Product</th>
                <th>Country</th>
                <th>Author</th>
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
                    <span className={article.qc_required ? "qc-badge warning" : "qc-badge success"}>
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
                  <td>{article.screening_decision}</td>

                  <td>
                    <button
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
                  <td colSpan={13}>No screening outputs available.</td>
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
          onApprove={approveToIntake}
          onExclude={excludeArticle}
          onSave={saveReview}
          onRerunAI={rerunAI}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          background: #f4f7fb;
          padding: 24px;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
        }

        .topbar {
          background: linear-gradient(135deg, #071b34, #123f68);
          color: #ffffff;
          border-radius: 20px;
          padding: 24px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18);
        }

        .topbar h1 {
          margin: 0;
          font-size: 30px;
        }

        .topbar p {
          margin: 6px 0 0;
          color: #cfe7ff;
        }

        .topbar-meta {
          display: flex;
          gap: 12px;
          align-items: center;
          font-size: 13px;
        }

        .topbar-meta span,
        .topbar-meta strong {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 10px;
          border-radius: 999px;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 18px;
        }

        .metric-card {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .metric-card span {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-bottom: 8px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .metric-card strong {
          font-size: 28px;
          color: #0f172a;
        }

        .metric-card.success strong {
          color: #15803d;
        }

        .metric-card.warning strong {
          color: #b45309;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .panel-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
        }

        .panel-header h2 {
          margin: 0 0 6px;
        }

        .panel-header p {
          margin: 0;
          color: #64748b;
        }

        .panel-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .search-input {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 11px 14px;
          min-width: 260px;
          outline: none;
        }

        .panel-actions button,
        .primary-action,
        .review-button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
          text-decoration: none;
          font-size: 14px;
        }

        .filters-row {
          display: flex;
          gap: 8px;
          padding: 14px 24px;
          border-bottom: 1px solid #e2e8f0;
          overflow-x: auto;
        }

        .filters-row button {
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #334155;
          padding: 8px 12px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .hits-table {
          width: 100%;
          min-width: 1350px;
          border-collapse: collapse;
        }

        .hits-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          text-transform: uppercase;
          text-align: left;
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .hits-table td {
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          font-size: 14px;
        }

        .mono {
          font-family: Consolas, Monaco, monospace;
          font-weight: 800;
          color: #185a9d;
        }

        small {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 12px;
        }

        .qc-badge {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .qc-badge.success {
          background: #dcfce7;
          color: #166534;
        }

        .qc-badge.warning {
          background: #fef3c7;
          color: #92400e;
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
          .topbar,
          .panel-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .topbar-meta {
            flex-wrap: wrap;
          }

          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .search-input {
            min-width: 100%;
          }
        }
      `}</style>
    </main>
  );
}