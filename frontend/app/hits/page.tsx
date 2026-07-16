"use client";

import { useEffect, useMemo, useState } from "react";

import Navigation from "@/components/Navigation";

type HitRecord = {
  hit_id: string;
  package_id: string;
  pmid: string;
  title: string;
  journal: string;
  publication_date: string;
  product_name: string;
  normalized_identity: string;
  matched_term: string;
  match_type: string;
  match_source: string;
  company_product_status: string;
  author_country: string;
  country_of_interest: string;
  mah_country_match: boolean;
  pii_present: boolean;
  confidence_score: number;
  qc_required: boolean;
  evidence_sentence: string;
  ai_summary: string;
};

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") return fallback;
  return String(value);
}

function percent(value: number) {
  if (!value) return "0%";
  return `${Math.round(value * 100)}%`;
}

function normalizeHit(raw: any, packageId: string): HitRecord {
  return {
    hit_id: raw.hit_id || `${packageId}-${raw.pmid || Date.now()}`,
    package_id: packageId,
    pmid: raw.pmid || "—",
    title: raw.title || "—",
    journal: raw.journal || "—",
    publication_date: raw.publication_date || "—",
    product_name: raw.product_name || "Unknown Product",
    normalized_identity: raw.normalized_identity || "—",
    matched_term: raw.matched_term || "—",
    match_type: raw.match_type || "—",
    match_source: raw.match_source || "—",
    company_product_status: raw.company_product_status || "—",
    author_country: raw.author_country || "—",
    country_of_interest: raw.country_of_interest || "—",
    mah_country_match: Boolean(raw.mah_country_match),
    pii_present: Boolean(raw.pii_present),
    confidence_score: Number(raw.confidence_score || 0),
    qc_required: Boolean(raw.qc_required || raw.qc_flags?.length),
    evidence_sentence: raw.evidence_sentence || "—",
    ai_summary: raw.ai_summary || "—",
  };
}

export default function HitsReviewPage() {
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedHit, setSelectedHit] = useState<HitRecord | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadHits();
  }, []);

  async function loadHits() {
    try {
      setLoading(true);

      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      const packages = await response.json();
      const items = Array.isArray(packages) ? packages : packages.packages || [];

      const allHits: HitRecord[] = [];

      for (const item of items) {
        if (!item.package_id) continue;

        const packageResponse = await fetch(
          `/api/workflow/package/${encodeURIComponent(item.package_id)}`,
          { cache: "no-store" }
        );

        const packageData = await packageResponse.json();

        const packageHits = packageData?.hits_output?.hits || [];

        for (const hit of packageHits) {
          allHits.push(normalizeHit(hit, item.package_id));
        }
      }

      setHits(allHits);
    } catch {
      showToast("Failed to load hits review records.");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredHits = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return hits;

    return hits.filter((hit) =>
      [
        hit.package_id,
        hit.pmid,
        hit.title,
        hit.product_name,
        hit.normalized_identity,
        hit.matched_term,
        hit.country_of_interest,
        hit.author_country,
        hit.journal,
        hit.ai_summary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [hits, search]);

  const metrics = useMemo(() => {
    return {
      total: hits.length,
      qcRequired: hits.filter((h) => h.qc_required).length,
      mahMatch: hits.filter((h) => h.mah_country_match).length,
      piiPresent: hits.filter((h) => h.pii_present).length,
      avgConfidence:
        hits.length > 0
          ? hits.reduce((sum, h) => sum + h.confidence_score, 0) / hits.length
          : 0,
    };
  }, [hits]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>ClinixAI</h1>
          <p>Literature Hits Review</p>
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
          <span>Total Hits</span>
          <strong>{metrics.total}</strong>
        </div>

        <div className="metric-card warning">
          <span>QC Required</span>
          <strong>{metrics.qcRequired}</strong>
        </div>

        <div className="metric-card success">
          <span>MAH Match</span>
          <strong>{metrics.mahMatch}</strong>
        </div>

        <div className="metric-card">
          <span>PII Present</span>
          <strong>{metrics.piiPresent}</strong>
        </div>

        <div className="metric-card">
          <span>Avg Confidence</span>
          <strong>{percent(metrics.avgConfidence)}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Hits Review Worklist</h2>
            <p>
              {loading
                ? "Loading hits output..."
                : `${filteredHits.length} hit(s) available for review`}
            </p>
          </div>

          <div className="panel-actions">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search PMID, product, country, title..."
            />

            <button onClick={loadHits}>Refresh</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="hits-table">
            <thead>
              <tr>
                <th>QC</th>
                <th>Package</th>
                <th>PMID</th>
                <th>Product</th>
                <th>Matched Term</th>
                <th>Country</th>
                <th>MAH</th>
                <th>PII</th>
                <th>Confidence</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredHits.map((hit) => (
                <tr key={hit.hit_id}>
                  <td>
                    <span className={hit.qc_required ? "qc-badge warning" : "qc-badge success"}>
                      {hit.qc_required ? "QC" : "Pass"}
                    </span>
                  </td>

                  <td className="mono">{hit.package_id}</td>
                  <td>{hit.pmid}</td>

                  <td>
                    <strong>{hit.product_name}</strong>
                    <small>{hit.normalized_identity}</small>
                  </td>

                  <td>
                    {hit.matched_term}
                    <small>{hit.match_type}</small>
                  </td>

                  <td>{hit.country_of_interest}</td>
                  <td>{hit.mah_country_match ? "Yes" : "No"}</td>
                  <td>{hit.pii_present ? "Yes" : "No"}</td>
                  <td>
                    <span className="confidence-pill">{percent(hit.confidence_score)}</span>
                  </td>

                  <td>
                    <button className="review-button" onClick={() => setSelectedHit(hit)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && filteredHits.length === 0 && (
                <tr>
                  <td colSpan={10}>No hits output available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedHit && (
        <aside className="review-panel">
          <div className="review-header">
            <div>
              <h2>Hit Review</h2>
              <p>{selectedHit.package_id}</p>
            </div>

            <button onClick={() => setSelectedHit(null)}>Close</button>
          </div>

          <div className="review-grid">
            <div>
              <span>PMID</span>
              <strong>{text(selectedHit.pmid)}</strong>
            </div>

            <div>
              <span>Product</span>
              <strong>{text(selectedHit.product_name)}</strong>
            </div>

            <div>
              <span>Matched Term</span>
              <strong>{text(selectedHit.matched_term)}</strong>
            </div>

            <div>
              <span>Country of Interest</span>
              <strong>{text(selectedHit.country_of_interest)}</strong>
            </div>

            <div>
              <span>MAH Match</span>
              <strong>{selectedHit.mah_country_match ? "Yes" : "No"}</strong>
            </div>

            <div>
              <span>Confidence</span>
              <strong>{percent(selectedHit.confidence_score)}</strong>
            </div>
          </div>

          <div className="text-block">
            <h3>Article Title</h3>
            <p>{text(selectedHit.title)}</p>
          </div>

          <div className="text-block">
            <h3>Evidence Sentence</h3>
            <p>{text(selectedHit.evidence_sentence)}</p>
          </div>

          <div className="text-block">
            <h3>AI Summary</h3>
            <p>{text(selectedHit.ai_summary)}</p>
          </div>
        </aside>
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
        }

        .metric-card.success strong {
          color: #15803d;
        }

        .metric-card.warning strong {
          color: #b45309;
        }

        .panel,
        .review-panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .panel-header,
        .review-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
        }

        .panel-header h2,
        .review-header h2 {
          margin: 0 0 6px;
        }

        .panel-header p,
        .review-header p {
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
          min-width: 320px;
          outline: none;
        }

        .panel-actions button,
        .review-button,
        .review-header button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .hits-table {
          width: 100%;
          min-width: 1150px;
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

        .qc-badge,
        .confidence-pill {
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

        .confidence-pill {
          background: #e0f2fe;
          color: #075985;
        }

        .review-panel {
          margin-top: 18px;
        }

        .review-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          padding: 24px;
        }

        .review-grid div {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px;
          background: #f8fafc;
        }

        .review-grid span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .review-grid strong {
          font-size: 14px;
        }

        .text-block {
          margin: 0 24px 18px;
          padding: 18px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
        }

        .text-block h3 {
          margin: 0 0 10px;
        }

        .text-block p {
          margin: 0;
          line-height: 1.6;
          color: #334155;
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

          .metrics-grid,
          .review-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid,
          .review-grid {
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