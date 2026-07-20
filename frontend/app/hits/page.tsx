"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Navigation from "@/components/Navigation";
import AdHocSearchWorkspace from "@/components/literature/AdHocSearchWorkspace";

// Enhanced type definition to track review workflow outcomes
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
  review_status: "pending" | "approved" | "dismissed" | "flagged"; // Added workflow state tracking
};

type SortConfig = {
  key: keyof HitRecord;
  direction: "asc" | "desc";
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
    hit_id: raw.hit_id || `${packageId}-${raw.pmid || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
    review_status: raw.review_status || "pending", // Set sensible operational default
  };
}

export default function HitsReviewPage() {
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedHit, setSelectedHit] = useState<HitRecord | null>(null);
  const [toast, setToast] = useState("");
  
  // Worklist Quick Filters state
  const [activeTab, setActiveTab] = useState<"all" | "pending_qc" | "approved" | "dismissed" | "flagged">("all");
  
  // Interactive sorting state configuration (Defaulting to descending confidence)
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({
    key: "confidence_score",
    direction: "desc",
  });

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadHits();
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  async function loadHits() {
    try {
      setLoading(true);
      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch packages list");
      
      const packages = await response.json();
      const items = Array.isArray(packages) ? packages : packages.packages || [];
      const validItems = items.filter((item: any) => item && item.package_id);

      const packagePromises = validItems.map(async (item: any) => {
        try {
          const packageResponse = await fetch(
            `/api/workflow/package/${encodeURIComponent(item.package_id)}`,
            { cache: "no-store" }
          );
          if (!packageResponse.ok) return [];

          const packageData = await packageResponse.json();
          const packageHits = packageData?.hits_output?.hits || [];

          return packageHits.map((hit: any) => normalizeHit(hit, item.package_id));
        } catch (err) {
          console.error(`Isolating failure for package: ${item.package_id}`, err);
          return [];
        }
      });

      const resolvedHitsArrays = await Promise.all(packagePromises);
      setHits(resolvedHitsArrays.flat());
    } catch (error) {
      console.error(error);
      showToast("Failed to load hits review records.");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  // Updates item status locally and hooks into mock/real backend mutations
  async function updateHitStatus(hitId: string, newStatus: HitRecord["review_status"]) {
    // 1. Instantly update UI locally for fluid responsiveness
    setHits((prevHits) =>
      prevHits.map((h) => (h.hit_id === hitId ? { ...h, review_status: newStatus } : h))
    );
    
    // Sync active sidebar item text details synchronously
    if (selectedHit && selectedHit.hit_id === hitId) {
      setSelectedHit((prev) => prev ? { ...prev, review_status: newStatus } : null);
    }

    showToast(`Hit item successfully updated to ${newStatus.toUpperCase()}`);

    // 2. Network Sync Hook: (Uncomment and structure path variables when endpoint is activated)
    /*
    try {
      await fetch(`/api/workflow/hit/${hitId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {
      console.error("Backend failed to retain workflow action mutation state", e);
    }
    */
  }

  // Sorting controller logic triggered via table column interactions
  function handleRequestSort(key: keyof HitRecord) {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  }

  // Dynamic Multi-layered filtering and sorting processor pipeline
  const processedHits = useMemo(() => {
    let output = [...hits];

    // Layer 1: Operational Status Tabs Filter logic
    if (activeTab === "pending_qc") {
      output = output.filter((h) => h.review_status === "pending" && h.qc_required);
    } else if (activeTab !== "all") {
      output = output.filter((h) => h.review_status === activeTab);
    }

    // Layer 2: Text Search Filtering Matching
    const q = search.trim().toLowerCase();
    if (q) {
      output = output.filter((hit) =>
        [
          hit.package_id, hit.pmid, hit.title, hit.product_name,
          hit.normalized_identity, hit.matched_term, hit.country_of_interest,
          hit.author_country, hit.journal, hit.ai_summary,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    // Layer 3: Interactive Sorting Resolution Execution
    if (sortConfig) {
      output.sort((a, b) => {
        const valueA = a[sortConfig.key];
        const valueB = b[sortConfig.key];

        if (valueA === valueB) return 0;
        
        // Ensure string safety or type fallback handling
        const cleanA = typeof valueA === "string" ? valueA.toLowerCase() : valueA;
        const cleanB = typeof valueB === "string" ? valueB.toLowerCase() : valueB;

        if (cleanA < cleanB) return sortConfig.direction === "asc" ? -1 : 1;
        if (cleanA > cleanB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return output;
  }, [hits, search, activeTab, sortConfig]);

  // Dynamically reactive KPIs driven by live dashboard status mutations
  const metrics = useMemo(() => {
    return {
      total: hits.length,
      qcRequired: hits.filter((h) => h.qc_required && h.review_status === "pending").length,
      processed: hits.filter((h) => h.review_status !== "pending").length,
      piiPresent: hits.filter((h) => h.pii_present).length,
      avgConfidence:
        hits.length > 0
          ? hits.reduce((sum, h) => sum + h.confidence_score, 0) / hits.length
          : 0,
    };
  }, [hits]);

  function showToast(message: string) {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(""), 3000);
  }

  // Helper template renderer providing intuitive down/up chevron cues for text headers
  const getSortIcon = (columnKey: keyof HitRecord) => {
    if (!sortConfig || sortConfig.key !== columnKey) return " ↕";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>ClinixAI</h1>
          <p>Literature Hits Review Processor</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <details className="enterprise-search-shell" open>
        <summary>
          <div>
            <span>SEARCH &amp; ARTICLE INTAKE</span>
            <strong>Enterprise Literature Search</strong>
            <small>PMID · DOI · Product identity · Company Product ID · Date range · Multi-database selection</small>
          </div>
          <em>Open / Collapse</em>
        </summary>
        <div className="enterprise-search-body">
          <AdHocSearchWorkspace />
        </div>
      </details>

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total Hits Ingested</span>
          <strong>{metrics.total}</strong>
        </div>

        <div className="metric-card warning">
          <span>Remaining Active QC</span>
          <strong>{metrics.qcRequired}</strong>
        </div>

        <div className="metric-card success">
          <span>Actioned Records</span>
          <strong>{metrics.processed}</strong>
        </div>

        <div className="metric-card">
          <span>PII Flagged</span>
          <strong>{metrics.piiPresent}</strong>
        </div>

        <div className="metric-card">
          <span>Mean Confidence</span>
          <strong>{percent(metrics.avgConfidence)}</strong>
        </div>
      </section>

      {/* Modern Workflow segment selection header tab controls */}
      <div className="tab-navigation">
        <button className={activeTab === "all" ? "active" : ""} onClick={() => setActiveTab("all")}>
          All Items ({hits.length})
        </button>
        <button className={activeTab === "pending_qc" ? "active" : ""} onClick={() => setActiveTab("pending_qc")}>
          Unresolved QC ({hits.filter(h => h.qc_required && h.review_status === "pending").length})
        </button>
        <button className={activeTab === "approved" ? "active" : ""} onClick={() => setActiveTab("approved")}>
          Approved ({hits.filter(h => h.review_status === "approved").length})
        </button>
        <button className={activeTab === "flagged" ? "active" : ""} onClick={() => setActiveTab("flagged")}>
          Escalated ({hits.filter(h => h.review_status === "flagged").length})
        </button>
        <button className={activeTab === "dismissed" ? "active" : ""} onClick={() => setActiveTab("dismissed")}>
          Dismissed ({hits.filter(h => h.review_status === "dismissed").length})
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Review Execution Queue</h2>
            <p>
              {loading
                ? "Streaming package data pipelines..."
                : `${processedHits.length} element(s) localized match filters`}
            </p>
          </div>

          <div className="panel-actions">
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter list values interactively..."
              disabled={loading}
            />

            <button onClick={loadHits} disabled={loading}>
              {loading ? "Syncing..." : "Refresh Queue"}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="hits-table">
            <thead>
              <tr>
                <th onClick={() => handleRequestSort("qc_required")} className="sortable">QC {getSortIcon("qc_required")}</th>
                <th onClick={() => handleRequestSort("package_id")} className="sortable">Package {getSortIcon("package_id")}</th>
                <th onClick={() => handleRequestSort("pmid")} className="sortable">PMID {getSortIcon("pmid")}</th>
                <th onClick={() => handleRequestSort("product_name")} className="sortable">Product {getSortIcon("product_name")}</th>
                <th onClick={() => handleRequestSort("matched_term")} className="sortable">Term Match {getSortIcon("matched_term")}</th>
                <th onClick={() => handleRequestSort("country_of_interest")} className="sortable">Country {getSortIcon("country_of_interest")}</th>
                <th>Status</th>
                <th onClick={() => handleRequestSort("confidence_score")} className="sortable">Confidence {getSortIcon("confidence_score")}</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {processedHits.map((hit) => (
                <tr key={hit.hit_id} className={selectedHit?.hit_id === hit.hit_id ? "row-selected" : ""}>
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
                  <td>
                    <span className={`status-pill ${hit.review_status}`}>
                      {hit.review_status}
                    </span>
                  </td>
                  <td>
                    <span className="confidence-pill">{percent(hit.confidence_score)}</span>
                  </td>

                  <td>
                    <button className="review-button" onClick={() => setSelectedHit(hit)}>
                      Analyze
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && processedHits.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "#64748b", padding: "40px 14px" }}>
                    No pending items match this operational queue filter condition.
                  </td>
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
              <h2>Interactive Workflow Decision</h2>
              <p>ID Context mapping: {selectedHit.package_id}</p>
            </div>
            <button className="close-panel-btn" onClick={() => setSelectedHit(null)}>Close View</button>
          </div>

          {/* New Active Workflow Action Row Bar components */}
          <div className="workflow-action-bar">
            <span>Commit Decision Audit:</span>
            <div className="action-buttons-group">
              <button 
                className="btn-action approve"
                disabled={selectedHit.review_status === "approved"}
                onClick={() => updateHitStatus(selectedHit.hit_id, "approved")}
              >
                Approve Entry
              </button>
              <button 
                className="btn-action flag"
                disabled={selectedHit.review_status === "flagged"}
                onClick={() => updateHitStatus(selectedHit.hit_id, "flagged")}
              >
                Escalate / Flag
              </button>
              <button 
                className="btn-action dismiss"
                disabled={selectedHit.review_status === "dismissed"}
                onClick={() => updateHitStatus(selectedHit.hit_id, "dismissed")}
              >
                Dismiss / Exclude
              </button>
            </div>
          </div>

          <div className="review-grid">
            <div>
              <span>PMID Reference</span>
              <strong>{text(selectedHit.pmid)}</strong>
            </div>

            <div>
              <span>Identified Target Product</span>
              <strong>{text(selectedHit.product_name)}</strong>
            </div>

            <div>
              <span>Captured Matched Term</span>
              <strong>{text(selectedHit.matched_term)}</strong>
            </div>

            <div>
              <span>Target Geo Region</span>
              <strong>{text(selectedHit.country_of_interest)}</strong>
            </div>

            <div>
              <span>MAH Status Match</span>
              <strong>{selectedHit.mah_country_match ? "Yes" : "No"}</strong>
            </div>

            <div>
              <span>Verification Confidence</span>
              <strong>{percent(selectedHit.confidence_score)}</strong>
            </div>
          </div>

          <div className="text-block">
            <h3>Article Title</h3>
            <p>{text(selectedHit.title)}</p>
          </div>

          <div className="text-block">
            <h3>Evidence Sentence Context</h3>
            <p>{text(selectedHit.evidence_sentence)}</p>
          </div>

          <div className="text-block">
            <h3>AI Summary Overview Extraction</h3>
            <p>{text(selectedHit.ai_summary)}</p>
          </div>
        </aside>
      )}

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`

        .enterprise-search-shell {
          margin: 18px 0;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        }

        .enterprise-search-shell > summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          cursor: pointer;
          list-style: none;
          background: linear-gradient(135deg, #0f172a, #1d4ed8);
          color: #ffffff;
        }

        .enterprise-search-shell > summary::-webkit-details-marker { display: none; }
        .enterprise-search-shell > summary div { display: grid; gap: 3px; }
        .enterprise-search-shell > summary span { font-size: 11px; letter-spacing: 0.14em; opacity: 0.75; }
        .enterprise-search-shell > summary strong { font-size: 20px; }
        .enterprise-search-shell > summary small { opacity: 0.84; }
        .enterprise-search-shell > summary em { font-style: normal; font-size: 12px; opacity: 0.8; white-space: nowrap; }
        .enterprise-search-body { padding: 16px; background: #f8fafc; }
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
          margin-bottom: 24px;
          margin-top: 18px;
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

        .tab-navigation {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .tab-navigation button {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          padding: 10px 18px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          color: #475569;
          white-space: nowrap;
          transition: all 0.2s ease;
        }

        .tab-navigation button:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .tab-navigation button.active {
          background: #1e293b;
          color: #ffffff;
          border-color: #1e293b;
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
        .close-panel-btn {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
        }

        .panel-actions button:disabled {
          background: #94a3b8;
          cursor: not-allowed;
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

        .hits-table th.sortable {
          cursor: pointer;
          user-select: none;
        }

        .hits-table th.sortable:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .hits-table td {
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          font-size: 14px;
        }

        .hits-table tr.row-selected {
          background: #f0f7ff;
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
        .confidence-pill,
        .status-pill {
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

        .status-pill.pending { background: #f1f5f9; color: #475569; }
        .status-pill.approved { background: #dcfce7; color: #166534; }
        .status-pill.dismissed { background: #fee2e2; color: #991b1b; }
        .status-pill.flagged { background: #ffedd5; color: #9a3412; }

        .review-panel {
          margin-top: 24px;
          border-top: 3px solid #185a9d;
        }

        .workflow-action-bar {
          background: #f8fafc;
          padding: 16px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .workflow-action-bar span {
          font-weight: 700;
          font-size: 14px;
          color: #334155;
        }

        .action-buttons-group {
          display: flex;
          gap: 8px;
        }

        .btn-action {
          border: 1px solid transparent;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-action:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          pointer-events: none;
        }

        .btn-action.approve { background: #22c55e; color: white; }
        .btn-action.approve:hover { background: #16a34a; }
        
        .btn-action.flag { background: #f97316; color: white; }
        .btn-action.flag:hover { background: #ea580c; }

        .btn-action.dismiss { background: #ef4444; color: white; }
        .btn-action.dismiss:hover { background: #dc2626; }

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
          color: #1e293b;
          font-size: 15px;
        }

        .text-block p {
          margin: 0;
          line-height: 1.6;
          color: #334155;
          white-space: pre-wrap;
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
            margin-top: 12px;
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
          
          .workflow-action-bar {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </main>
  );
}