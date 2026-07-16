"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import type { PackageAudit, PackageRecord, PackageState } from "@/lib/package-workflow-store";
import {
  getWorkflowPackageAudit,
  performWorkflowPackageAction,
  searchWorkflowPackages,
} from "@/lib/package-api";

const users = ["QC User", "PV Lead", "Super User", "Client Admin"];
const routeOptions: PackageState[] = ["HITS_REVIEW", "SCREENING_REVIEW", "SCREENING_RUNNING"];

function stateClass(state: string) {
  if (state.includes("LOCKED")) return "locked";
  if (state.includes("REVIEW")) return "review";
  if (state.includes("COMPLETE")) return "complete";
  if (state.includes("ROUTE")) return "route";
  if (state.includes("OVERRIDE")) return "override";
  if (state.includes("RUNNING")) return "running";
  return "default";
}

function formatDate(value: string) {
  if (!value || value === "—") return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function SuperUserConsolePage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState("QC User");
  const [routeTo, setRouteTo] = useState<PackageState>("SCREENING_REVIEW");
  const [comment, setComment] = useState("");
  const [auditTrail, setAuditTrail] = useState<PackageAudit[]>([]);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    loadPackages("");
  }, []);

  const selectedPackage = useMemo(() => {
    return packages.find((pkg) => pkg.packageId === selectedId) || packages[0] || null;
  }, [packages, selectedId]);

  async function loadPackages(query: string) {
    try {
      setLoading(true);
      const data = await searchWorkflowPackages(query);
      const records: PackageRecord[] = data.packages || [];

      setPackages(records);

      const nextSelected = records.find((item) => item.packageId === selectedId) || records[0];

      if (nextSelected) {
        setSelectedId(nextSelected.packageId);
        await loadAudit(nextSelected.packageId);
      } else {
        setSelectedId("");
        setAuditTrail([]);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load packages.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit(packageId: string) {
    try {
      const data = await getWorkflowPackageAudit(packageId);
      setAuditTrail(data.audit || []);
    } catch {
      setAuditTrail([]);
    }
  }

  async function runAction(action: "ASSIGN" | "UNLOCK" | "LOCK" | "OVERRIDE" | "ROUTE_BACK" | "FORCE_RERUN") {
    if (!selectedPackage) {
      showToast("No package selected.");
      return;
    }

    const commentRequired = ["UNLOCK", "LOCK", "OVERRIDE", "ROUTE_BACK", "FORCE_RERUN"].includes(action);

    if (commentRequired && !comment.trim()) {
      showToast(`${action} requires a mandatory comment.`);
      return;
    }

    try {
      setActionLoading(action);

      const result = await performWorkflowPackageAction({
        packageId: selectedPackage.packageId,
        action,
        assignedTo: action === "ASSIGN" ? selectedUser : undefined,
        routeTo: action === "ROUTE_BACK" ? routeTo : undefined,
        comment,
      });

      setPackages((current) =>
        current.map((pkg) =>
          pkg.packageId === result.package.packageId ? result.package : pkg
        )
      );

      setAuditTrail(result.audit || []);
      setSelectedId(result.package.packageId);
      setComment("");

      showToast(`${action} completed.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setActionLoading("");
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  function handleSelectPackage(packageId: string) {
    setSelectedId(packageId);
    loadAudit(packageId);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Super User Console</h1>
          <p>Search, assign, unlock, override, route back and comment on workflow packages</p>
        </div>

        <div className="topbar-meta">
          <span>Tenant: Demo Tenant</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="search-panel">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search PMID, package ID, product, article title, state, assigned user..."
        />
        <button onClick={() => loadPackages(search)}>
          {loading ? "Searching..." : "Search"}
        </button>
        <button className="secondary" onClick={() => {
          setSearch("");
          loadPackages("");
        }}>
          Clear
        </button>
      </section>

      <section className="console-grid">
        <aside className="queue-panel">
          <div className="panel-header">
            <h2>Package Queue</h2>
            <p>{packages.length} package(s)</p>
          </div>

          <div className="package-list">
            {packages.map((pkg) => (
              <button
                key={pkg.packageId}
                className={selectedPackage?.packageId === pkg.packageId ? "selected" : ""}
                onClick={() => handleSelectPackage(pkg.packageId)}
              >
                <strong>{pkg.packageId}</strong>
                <span>{pkg.product}</span>
                <em className={stateClass(pkg.currentState)}>{pkg.currentState}</em>
              </button>
            ))}

            {!loading && packages.length === 0 && (
              <div className="empty">No packages found.</div>
            )}
          </div>
        </aside>

        <section className="detail-panel">
          {!selectedPackage ? (
            <div className="empty-detail">Select a package to view details.</div>
          ) : (
            <>
              <div className="panel-header">
                <div>
                  <h2>{selectedPackage.packageId}</h2>
                  <p>{selectedPackage.title}</p>
                </div>

                <span className={`state-pill ${stateClass(selectedPackage.currentState)}`}>
                  {selectedPackage.currentState}
                </span>
              </div>

              <div className="detail-grid">
                <div>
                  <span>PMID</span>
                  <strong>{selectedPackage.pmid}</strong>
                </div>
                <div>
                  <span>Product</span>
                  <strong>{selectedPackage.product}</strong>
                </div>
                <div>
                  <span>Tenant</span>
                  <strong>{selectedPackage.tenantName}</strong>
                </div>
                <div>
                  <span>Environment</span>
                  <strong>{selectedPackage.environment}</strong>
                </div>
                <div>
                  <span>Assigned To</span>
                  <strong>{selectedPackage.assignedTo}</strong>
                </div>
                <div>
                  <span>Locked</span>
                  <strong>{selectedPackage.locked ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span>Locked At</span>
                  <strong>{formatDate(selectedPackage.lockedAt)}</strong>
                </div>
                <div>
                  <span>Version</span>
                  <strong>v{selectedPackage.version}</strong>
                </div>
              </div>

              <div className="timeline-panel">
                <h3>Workflow State Timeline</h3>
                <div className="timeline">
                  <div className="done">Evidence Package</div>
                  <div className="done">Hits</div>
                  <div className="done">Screening</div>
                  <div className={selectedPackage.locked ? "done" : "active"}>
                    {selectedPackage.locked ? "Locked" : "Unlocked"}
                  </div>
                  <div className={selectedPackage.currentState.includes("REVIEW") ? "active" : ""}>
                    Review
                  </div>
                </div>
              </div>

              <div className="audit-panel">
                <h3>Audit Trail</h3>

                {auditTrail.map((item) => (
                  <div key={item.id} className="audit-row">
                    <strong>{item.action}</strong>
                    <p>{item.comment || "—"}</p>
                    <small>
                      {formatDate(item.timestamp)} · {item.performedBy} · {item.role}
                    </small>
                    <small>
                      {item.oldValue} → {item.newValue}
                    </small>
                  </div>
                ))}

                {auditTrail.length === 0 && <div className="empty">No audit records found.</div>}
              </div>
            </>
          )}
        </section>

        <aside className="action-panel">
          <h2>Actions</h2>

          <label>
            Assign To
            <select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)}>
              {users.map((user) => (
                <option key={user}>{user}</option>
              ))}
            </select>
          </label>

          <label>
            Route Back Destination
            <select value={routeTo} onChange={(event) => setRouteTo(event.target.value as PackageState)}>
              {routeOptions.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>

          <label>
            Comment / Reason
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Mandatory for unlock, override, route back, force rerun and lock..."
            />
          </label>

          <div className="action-buttons">
            <button disabled={!!actionLoading} onClick={() => runAction("ASSIGN")}>
              {actionLoading === "ASSIGN" ? "Assigning..." : "Assign User"}
            </button>
            <button disabled={!!actionLoading} onClick={() => runAction("UNLOCK")}>
              {actionLoading === "UNLOCK" ? "Unlocking..." : "Unlock"}
            </button>
            <button disabled={!!actionLoading} onClick={() => runAction("OVERRIDE")}>
              {actionLoading === "OVERRIDE" ? "Saving..." : "Override"}
            </button>
            <button disabled={!!actionLoading} onClick={() => runAction("ROUTE_BACK")}>
              {actionLoading === "ROUTE_BACK" ? "Routing..." : "Route Back"}
            </button>
            <button disabled={!!actionLoading} onClick={() => runAction("FORCE_RERUN")}>
              {actionLoading === "FORCE_RERUN" ? "Requesting..." : "Force Re-run"}
            </button>
            <button disabled={!!actionLoading} onClick={() => runAction("LOCK")}>
              {actionLoading === "LOCK" ? "Locking..." : "Lock with Timestamp"}
            </button>
          </div>

          <div className="rule-card">
            <h3>Locking Rule</h3>
            <p>
              Once a package is processed and reviewed, it should be locked with timestamp.
              Unlock, override and route back require comment and audit entry.
            </p>
          </div>
        </aside>
      </section>

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

        .search-panel {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 18px;
          margin-bottom: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 12px;
          padding: 12px 14px;
          outline: none;
          font-size: 14px;
        }

        textarea {
          min-height: 120px;
          resize: vertical;
        }

        button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 11px 14px;
          cursor: pointer;
          font-weight: 800;
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        button.secondary {
          background: #e2e8f0;
          color: #334155;
        }

        .console-grid {
          display: grid;
          grid-template-columns: 300px 1fr 320px;
          gap: 18px;
          align-items: start;
        }

        .queue-panel,
        .detail-panel,
        .action-panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }

        .panel-header {
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
        }

        .panel-header h2 {
          margin: 0 0 6px;
        }

        .panel-header p {
          margin: 0;
          color: #64748b;
          line-height: 1.5;
        }

        .package-list {
          display: flex;
          flex-direction: column;
          max-height: 760px;
          overflow-y: auto;
        }

        .package-list button {
          background: #ffffff;
          color: #0f172a;
          border-radius: 0;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          padding: 16px;
        }

        .package-list button.selected,
        .package-list button:hover {
          background: #eff6ff;
        }

        .package-list strong,
        .package-list span {
          display: block;
          margin-bottom: 6px;
        }

        em,
        .state-pill {
          display: inline-flex;
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-style: normal;
          font-weight: 900;
          text-transform: uppercase;
        }

        .locked {
          background: #fee2e2;
          color: #991b1b;
        }

        .review {
          background: #fef3c7;
          color: #92400e;
        }

        .complete {
          background: #dcfce7;
          color: #166534;
        }

        .route,
        .override {
          background: #ede9fe;
          color: #6d28d9;
        }

        .running {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .default {
          background: #e2e8f0;
          color: #475569;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          padding: 20px;
        }

        .detail-grid div {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 14px;
        }

        .detail-grid span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .timeline-panel,
        .audit-panel {
          padding: 20px;
          border-top: 1px solid #e2e8f0;
        }

        .timeline-panel h3,
        .audit-panel h3,
        .action-panel h2,
        .rule-card h3 {
          margin: 0 0 14px;
        }

        .timeline {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .timeline div {
          background: #f1f5f9;
          color: #64748b;
          border-radius: 14px;
          padding: 12px;
          font-size: 12px;
          font-weight: 800;
          text-align: center;
        }

        .timeline div.done {
          background: #dcfce7;
          color: #166534;
        }

        .timeline div.active {
          background: #fef3c7;
          color: #92400e;
        }

        .audit-row {
          padding: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          margin-bottom: 10px;
          background: #f8fafc;
        }

        .audit-row strong {
          color: #185a9d;
        }

        .audit-row p {
          margin: 6px 0;
          color: #334155;
        }

        .audit-row small {
          display: block;
          color: #64748b;
          margin-top: 4px;
        }

        .action-panel {
          padding: 20px;
        }

        label {
          display: block;
          color: #475569;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        label select,
        label textarea {
          margin-top: 8px;
        }

        .action-buttons {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .rule-card {
          margin-top: 18px;
          border: 1px solid #fed7aa;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 16px;
          padding: 16px;
        }

        .rule-card p {
          margin: 0;
          line-height: 1.6;
        }

        .empty,
        .empty-detail {
          padding: 24px;
          color: #64748b;
          font-weight: 800;
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

        @media (max-width: 1300px) {
          .console-grid {
            grid-template-columns: 1fr;
          }

          .detail-grid,
          .timeline {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .search-panel,
          .detail-grid,
          .timeline {
            grid-template-columns: 1fr;
          }

          .topbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .topbar-meta {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </main>
  );
}