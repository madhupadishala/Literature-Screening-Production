"use client";

import { useEffect, useMemo, useState } from "react";
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
    showToast("Screening output approved to Intake.");
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
          <p>Literature Intelligence Workspace</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <nav className="nav-tabs">
        {["Dashboard", "Hits", "Screening", "Intake", "Reports", "Audit", "Knowledge"].map(
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
          <span>Serious</span>
          <strong>{articles.filter((a) => a.seriousness === "Serious").length}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Screening Worklist</h2>
            <p>
              {loading
                ? "Loading screening output..."
                : `${readyArticles.length} article ready for human screening review`}
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
                <th>PRODUCT</th>
                <th>COUNTRY</th>
                <th>AUTHOR</th>
                <th>COMPANY SUSPECT</th>
                <th>ACTIVE MAH</th>
                <th>CLINICAL EVENT</th>
                <th>SERIOUSNESS</th>
                <th>PII</th>
                <th>COI</th>
                <th>DECISION</th>
                <th>ACTION</th>
              </tr>
            </thead>

            <tbody>
              {readyArticles.map((article) => (
                <tr key={article.hit_id}>
                  <td>
                    <span className="qc-badge">{article.qc_required ? "QC" : "Pass"}</span>
                  </td>
                  <td>{article.pmid}</td>
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
    </main>
  );
}