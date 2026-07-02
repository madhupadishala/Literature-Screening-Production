"use client";

import { useMemo, useState } from "react";
import ReviewWorkspace from "../components/ReviewWorkspace";

type QcFlag = {
  field_name: string;
  severity: string;
  reason: string;
  evidence?: string | null;
};

type PiiFinding = {
  pii_type: string;
  value: string;
  evidence: string;
  confidence: number;
  qc_required: boolean;
};

export type Hit = {
  hit_id: string;
  pmid: string;
  doi?: string | null;
  title?: string | null;
  journal?: string | null;
  publication_date?: string | null;
  product_name?: string | null;
  normalized_identity?: string | null;
  matched_term?: string | null;
  match_type?: string | null;
  match_source?: string | null;
  detected_strength?: string | null;
  detected_formulation?: string | null;
  company_product_status?: string | null;
  country_of_interest?: string | null;
  author_country?: string | null;
  primary_author?: string | null;
  all_authors?: string[];
  mah_country_status?: string | null;
  mah_country_match?: boolean;
  pii_present: boolean;
  pii_findings: PiiFinding[];
  confidence_score: number;
  qc_required: boolean;
  qc_flags: QcFlag[];
  hits_status: string;
  screening_status: string;
  evidence_sentence?: string | null;
  ai_summary?: string | null;
};

const hitsData: Hit[] = [
  {
    hit_id: "HIT-DEMO001-7d9571f0d1c2",
    pmid: "DEMO001",
    doi: "10.1000/clinixai.demo001",
    title: "Acetaminophen-induced acute liver injury: a case report from Germany",
    journal: "Journal of Clinical Pharmacovigilance",
    publication_date: "2024 May 14",
    product_name: "Paracetamol",
    normalized_identity: "Acetaminophen",
    matched_term: "Tylenol",
    match_type: "brand",
    match_source: "CLIENT_PRODUCT_MASTER",
    detected_strength: "500 mg",
    detected_formulation: "tablet",
    company_product_status: "company_product",
    country_of_interest: "Germany",
    author_country: "Germany",
    primary_author: "Rao M",
    all_authors: ["Rao M", "Sharma K", "Miller A"],
    mah_country_status: "mah_country_match",
    mah_country_match: true,
    pii_present: true,
    pii_findings: [
      {
        pii_type: "age",
        value: "45",
        evidence: "A 45-year-old male patient in Germany...",
        confidence: 0.85,
        qc_required: false,
      },
      {
        pii_type: "sex_male",
        value: "male",
        evidence: "A 45-year-old male patient in Germany...",
        confidence: 0.75,
        qc_required: true,
      },
    ],
    confidence_score: 0.8333,
    qc_required: true,
    qc_flags: [
      {
        field_name: "pii",
        severity: "low",
        reason: "Some PII findings require manual verification.",
      },
    ],
    hits_status: "ready_for_screening",
    screening_status: "pending",
    evidence_sentence:
      "A 45-year-old male patient in Germany developed acute liver injury after receiving Tylenol 500 mg tablet for fever.",
    ai_summary:
      "One company product was identified. The article reports a 45-year-old male from Germany who developed acute liver injury after Tylenol 500 mg tablet. The detected country is within the MAH territory. The article is ready for Screening.",
  },
];

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function clean(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

export default function HomePage() {
  const [hits, setHits] = useState<Hit[]>(hitsData);
  const [search, setSearch] = useState("");
  const [selectedHit, setSelectedHit] = useState<Hit | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [toast, setToast] = useState("");

  const filteredHits = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return hits;

    return hits.filter((hit) =>
      [
        hit.pmid,
        hit.product_name,
        hit.country_of_interest,
        hit.primary_author,
        hit.title,
        hit.journal,
        hit.hits_status,
        hit.screening_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [hits, search]);

  const metrics = useMemo(() => {
    const total = hits.length;
    const ready = hits.filter(
      (hit) => hit.hits_status === "ready_for_screening"
    ).length;
    const qcPending = hits.filter((hit) => hit.qc_required).length;
    const avgConfidence =
      total > 0
        ? hits.reduce((sum, hit) => sum + hit.confidence_score, 0) / total
        : 0;
    const mahMatches = hits.filter((hit) => hit.mah_country_match).length;

    return {
      total,
      ready,
      qcPending,
      avgConfidence,
      mahRate: total > 0 ? mahMatches / total : 0,
    };
  }, [hits]);

  function openReview(hit: Hit) {
    setSelectedHit(hit);
    setActiveTab("Overview");
  }

  function approveToScreening() {
    if (!selectedHit) return;

    const updatedHit: Hit = {
      ...selectedHit,
      hits_status: "completed",
      screening_status: "ready",
    };

    setHits((current) =>
      current.map((hit) => (hit.hit_id === selectedHit.hit_id ? updatedHit : hit))
    );

    setSelectedHit(updatedHit);
    setToast("Article successfully sent to Screening.");

    window.setTimeout(() => {
      setToast("");
    }, 2500);
  }

  return (
    <main className={`app-shell ${selectedHit ? "review-open" : ""}`}>
      <header className="topbar">
        <div>
          <div className="brand">ClinixAI</div>
          <div className="subtitle">Literature Intelligence Workspace</div>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <span className="prod-badge">PROD</span>
        </div>
      </header>

      <nav className="nav-tabs">
        {[
          "Dashboard",
          "Hits",
          "Screening",
          "Intake",
          "QC",
          "Reports",
          "Audit",
          "Knowledge",
        ].map((item, index) => (
          <button key={item} className={`nav-item ${index === 1 ? "active" : ""}`}>
            {item}
          </button>
        ))}
      </nav>

      <section className="metrics-grid">
        <MetricCard label="Total Hits" value={String(metrics.total)} />
        <MetricCard label="Ready for Screening" value={String(metrics.ready)} />
        <MetricCard
          label="QC Pending"
          value={String(metrics.qcPending)}
          tone="warning"
        />
        <MetricCard
          label="Average Confidence"
          value={percent(metrics.avgConfidence)}
        />
        <MetricCard
          label="MAH Match Rate"
          value={percent(metrics.mahRate)}
          tone="success"
        />
      </section>

      <section className="workspace-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h1>Active Hits</h1>
              <p>{filteredHits.length} article ready for review</p>
            </div>

            <div className="panel-actions">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PMID, product, author..."
                className="search-input"
              />
              <button className="secondary-button">Refresh</button>
              <button className="primary-button">Export</button>
            </div>
          </div>

          <div className="filters-row">
            <button>Product ▾</button>
            <button>Country ▾</button>
            <button>Status ▾</button>
            <button>Confidence ▾</button>
            <button>Date ▾</button>
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
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Screening</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredHits.map((hit) => (
                  <tr
                    key={hit.hit_id}
                    className={
                      selectedHit?.hit_id === hit.hit_id ? "selected-row" : ""
                    }
                  >
                    <td>
                      <span
                        className={
                          hit.qc_required ? "qc-chip warning" : "qc-chip success"
                        }
                      >
                        {hit.qc_required ? "QC" : "Pass"}
                      </span>
                    </td>

                    <td className="mono">{hit.pmid}</td>

                    <td>
                      <strong>{hit.product_name}</strong>
                      <div className="muted-small">
                        {clean(hit.company_product_status)}
                      </div>
                    </td>

                    <td>{hit.country_of_interest}</td>
                    <td>{hit.primary_author}</td>

                    <td>
                      <span className="confidence-pill">
                        {percent(hit.confidence_score)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          hit.hits_status === "completed"
                            ? "status-pill completed"
                            : "status-pill"
                        }
                      >
                        {clean(hit.hits_status)}
                      </span>
                    </td>

                    <td>{clean(hit.screening_status)}</td>

                    <td>
                      <button
                        className="review-button"
                        onClick={() => openReview(hit)}
                      >
                        {selectedHit?.hit_id === hit.hit_id ? "Opened" : "Review"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedHit && (
          <ReviewWorkspace
            hit={selectedHit}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onClose={() => setSelectedHit(null)}
            onApprove={approveToScreening}
          />
        )}
      </section>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className={`metric-card ${tone ?? ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}