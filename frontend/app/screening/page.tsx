"use client";

import { useMemo, useState } from "react";
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
  qc_required: boolean;
  screening_status: "ready" | "completed" | "excluded";
  intake_status: "pending" | "ready";
  screening_decision: string;
  adverse_event: string;
  suspect_product: string;
  patient: string;
  reporter: string;
  minimum_criteria: string;
  validity_recommendation: string;
  ai_reasoning: string;
  evidence_sentence: string;
  flags: string[];
  audit_trail: AuditEvent[];
};

const initialArticles: ScreeningArticle[] = [
  {
    hit_id: "HIT-DEMO001",
    pmid: "DEMO001",
    title: "Acetaminophen-induced acute liver injury: a case report from Germany",
    journal: "Journal of Clinical Pharmacovigilance",
    publication_date: "2024 May 14",
    product_name: "Paracetamol",
    country_of_interest: "Germany",
    primary_author: "Rao M",
    confidence_score: 0.83,
    qc_required: true,
    screening_status: "ready",
    intake_status: "pending",
    screening_decision: "Potential Safety Report",
    adverse_event: "Acute liver injury",
    suspect_product: "Paracetamol / Acetaminophen",
    patient: "45-year-old male patient",
    reporter: "Primary literature author",
    minimum_criteria:
      "Patient information, reporter information, suspect product, and adverse event identified.",
    validity_recommendation: "Potentially valid safety report. Recommended for Intake review.",
    ai_reasoning:
      "The article contains human safety information, identifiable patient details, reporter information, suspect product, and an adverse event after product exposure.",
    evidence_sentence:
      "A 45-year-old male patient in Germany developed acute liver injury after receiving Tylenol 500 mg tablet for fever.",
    flags: ["Confidence below 90%", "Patient age requires manual confirmation"],
    audit_trail: [],
  },
];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function ScreeningPage() {
  const [articles, setArticles] = useState(initialArticles);
  const [selected, setSelected] = useState<ScreeningArticle | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");

  const readyArticles = useMemo(() => {
    const q = search.toLowerCase().trim();

    return articles
      .filter((a) => a.screening_status === "ready")
      .filter((a) => {
        if (!q) return true;
        return [
          a.pmid,
          a.product_name,
          a.country_of_interest,
          a.primary_author,
          a.screening_decision,
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
      module: "Screening",
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
      "APPROVE_TO_INTAKE",
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
    showToast("Screening article approved to Intake.");
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
      "previous_ai_assessment",
      "new_ai_assessment_requested",
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
          <p>Literature Intelligence Workspace</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <nav className="nav-tabs">
        {["Dashboard", "Hits", "Screening", "Intake", "QC", "Reports", "Audit", "Knowledge"].map(
          (item) => (
            <button key={item} className={item === "Screening" ? "nav-item active" : "nav-item"}>
              {item}
            </button>
          )
        )}
      </nav>

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total Screening</span>
          <strong>{articles.length}</strong>
        </div>
        <div className="metric-card warning">
          <span>Ready</span>
          <strong>{readyArticles.length}</strong>
        </div>
        <div className="metric-card success">
          <span>Completed</span>
          <strong>{articles.filter((a) => a.screening_status === "completed").length}</strong>
        </div>
        <div className="metric-card">
          <span>Ready for Intake</span>
          <strong>{articles.filter((a) => a.intake_status === "ready").length}</strong>
        </div>
        <div className="metric-card warning">
          <span>QC Required</span>
          <strong>{articles.filter((a) => a.qc_required).length}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Screening Worklist</h2>
            <p>{readyArticles.length} article ready for human review</p>
          </div>

          <div className="panel-actions">
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PMID, product, author..."
            />
            <button>Refresh</button>
            <button className="primary-action">Export</button>
          </div>
        </div>

        <div className="filters-row">
          <button>QC ▾</button>
          <button>Product ▾</button>
          <button>Country ▾</button>
          <button>Decision ▾</button>
          <button>Confidence ▾</button>
        </div>

        <div className="table-wrap">
          <table className="hits-table">
            <thead>
              <tr>
                <th>QC</th>
                <th>PMID</th>
                <th>PRODUCT</th>
                <th>COUNTRY</th>
                <th>AUTHOR</th>
                <th>DECISION</th>
                <th>CONFIDENCE</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {readyArticles.map((article) => (
                <tr key={article.hit_id}>
                  <td>
                    <span className="qc-badge">QC</span>
                  </td>
                  <td>{article.pmid}</td>
                  <td>
                    <strong>{article.product_name}</strong>
                    <small>screening article</small>
                  </td>
                  <td>{article.country_of_interest}</td>
                  <td>{article.primary_author}</td>
                  <td>{article.screening_decision}</td>
                  <td>
                    <span className="confidence-badge">{percent(article.confidence_score)}</span>
                  </td>
                  <td>
                    <span className="status-pill ready">Ready</span>
                  </td>
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
    </main>
  );
}