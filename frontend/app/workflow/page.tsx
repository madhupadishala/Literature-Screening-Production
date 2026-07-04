"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WorkflowPackage = {
  package_id: string;
  pmid: string;
  title: string;
  status: string;
  updated_at: string;
  hits_count: number;
  screening_count: number;
  intake_input_count: number;
};

const statusLabels: Record<string, string> = {
  NEW: "New",
  HITS_RUNNING: "Hits Running",
  HITS_COMPLETE: "Hits Complete",
  SCREENING_RUNNING: "Screening Running",
  SCREENING_COMPLETE: "Screening Complete",
  INTAKE_INPUT_CREATED: "Intake Input Created",
};

function getActionLabel(status: string) {
  if (status === "INTAKE_INPUT_CREATED") return "View";
  if (status === "NEW") return "Run Hits";
  if (status === "HITS_COMPLETE") return "Run Screening";
  if (status === "SCREENING_COMPLETE") return "Build Intake";
  if (status.includes("RUNNING")) return "Running...";
  return "Run";
}

function isWorkflowRunnable(status: string) {
  return status !== "INTAKE_INPUT_CREATED" && !status.includes("RUNNING");
}

export default function WorkflowPage() {
  const router = useRouter();

  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPackage, setRunningPackage] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadPackages();
  }, []);

  const metrics = useMemo(() => {
    return {
      total: packages.length,
      completed: packages.filter((p) => p.status === "INTAKE_INPUT_CREATED").length,
      pending: packages.filter((p) => p.status !== "INTAKE_INPUT_CREATED").length,
      hits: packages.reduce((sum, p) => sum + Number(p.hits_count || 0), 0),
      intake: packages.reduce((sum, p) => sum + Number(p.intake_input_count || 0), 0),
    };
  }, [packages]);

  async function loadPackages() {
    try {
      setLoading(true);

      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      const data = await response.json();

      setPackages(Array.isArray(data) ? data : data.packages || []);
    } catch {
      showToast("Failed to load workflow packages.");
    } finally {
      setLoading(false);
    }
  }

  async function runWorkflow(packageId: string) {
    try {
      setRunningPackage(packageId);

      const response = await fetch("/api/workflow/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: "demo-tenant",
          package_id: packageId,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        showToast(data.error || "Workflow failed.");
        return;
      }

      showToast(
        `Workflow completed: Hits ${data.hits_count}, Screening ${data.screening_count}, Intake ${data.intake_input_count}`
      );

      await loadPackages();
    } catch {
      showToast("Workflow execution failed.");
    } finally {
      setRunningPackage(null);
    }
  }

  function openPackage(packageId: string) {
    router.push(`/workflow/${encodeURIComponent(packageId)}`);
  }

  function handleAction(pkg: WorkflowPackage) {
    if (pkg.status === "INTAKE_INPUT_CREATED") {
      openPackage(pkg.package_id);
      return;
    }

    if (isWorkflowRunnable(pkg.status)) {
      runWorkflow(pkg.package_id);
    }
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>ClinixAI</h1>
          <p>Literature Workflow Manager</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <nav className="nav-tabs">
        {["Dashboard", "Workflow", "Hits", "Screening", "Intake", "Reports", "Audit", "Knowledge"].map(
          (item) => (
            <button key={item} className={item === "Workflow" ? "nav-item active" : "nav-item"}>
              {item}
            </button>
          )
        )}
      </nav>

      <section className="metrics-grid">
        <div className="metric-card">
          <span>Total Packages</span>
          <strong>{metrics.total}</strong>
        </div>

        <div className="metric-card success">
          <span>Completed</span>
          <strong>{metrics.completed}</strong>
        </div>

        <div className="metric-card warning">
          <span>Pending</span>
          <strong>{metrics.pending}</strong>
        </div>

        <div className="metric-card">
          <span>Total Hits</span>
          <strong>{metrics.hits}</strong>
        </div>

        <div className="metric-card">
          <span>Intake Packages</span>
          <strong>{metrics.intake}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Literature Workflow Manager</h2>
            <p>
              {loading
                ? "Loading workflow packages..."
                : `${packages.length} evidence package(s) available`}
            </p>
          </div>

          <div className="panel-actions">
            <button onClick={loadPackages}>Refresh</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="hits-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>PMID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Hits</th>
                <th>Screening</th>
                <th>Intake</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {packages.map((pkg) => {
                const isRunning = runningPackage === pkg.package_id;
                const actionLabel = isRunning ? "Running..." : getActionLabel(pkg.status);

                return (
                  <tr
                    key={pkg.package_id}
                    className="clickable-row"
                    onClick={() => openPackage(pkg.package_id)}
                  >
                    <td className="mono">{pkg.package_id}</td>
                    <td>{pkg.pmid || "—"}</td>
                    <td>
                      <strong>{pkg.title || "Untitled evidence package"}</strong>
                    </td>
                    <td>
                      <span className={`status-pill ${pkg.status.toLowerCase()}`}>
                        {statusLabels[pkg.status] || pkg.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td>
                      <div className="mini-progress">
                        <span className={pkg.hits_count > 0 ? "done" : ""}>Hits</span>
                        <span className={pkg.screening_count > 0 ? "done" : ""}>Screening</span>
                        <span className={pkg.intake_input_count > 0 ? "done" : ""}>Intake</span>
                      </div>
                    </td>
                    <td>{pkg.hits_count}</td>
                    <td>{pkg.screening_count}</td>
                    <td>{pkg.intake_input_count}</td>
                    <td>{pkg.updated_at || "—"}</td>
                    <td>
                      <button
                        className="review-button"
                        disabled={isRunning || pkg.status.includes("RUNNING")}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAction(pkg);
                        }}
                      >
                        {actionLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!loading && packages.length === 0 && (
                <tr>
                  <td colSpan={10}>No evidence packages found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

        .nav-tabs {
          margin: 18px 0;
          display: flex;
          gap: 8px;
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 16px;
          padding: 8px;
          overflow-x: auto;
        }

        .nav-item {
          border: none;
          background: transparent;
          padding: 11px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 700;
          color: #334155;
          white-space: nowrap;
        }

        .nav-item.active {
          background: #185a9d;
          color: #ffffff;
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

        .panel-actions button,
        .review-button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 800;
        }

        .review-button:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }

        .table-wrap {
          overflow-x: auto;
        }

        .hits-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1150px;
        }

        .hits-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          text-transform: uppercase;
          text-align: left;
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
        }

        .hits-table td {
          padding: 14px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          font-size: 14px;
        }

        .clickable-row {
          cursor: pointer;
        }

        .clickable-row:hover {
          background: #f8fbff;
        }

        .mono {
          font-family: Consolas, Monaco, monospace;
          font-weight: 800;
          color: #185a9d;
        }

        .status-pill {
          display: inline-flex;
          padding: 7px 10px;
          border-radius: 999px;
          background: #eef2f7;
          color: #475569;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .status-pill.hits_running,
        .status-pill.screening_running {
          background: #e0f2fe;
          color: #075985;
        }

        .status-pill.hits_complete {
          background: #ecfeff;
          color: #0e7490;
        }

        .status-pill.screening_complete {
          background: #f3e8ff;
          color: #7e22ce;
        }

        .status-pill.intake_input_created {
          background: #dcfce7;
          color: #166534;
        }

        .mini-progress {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .mini-progress span {
          padding: 5px 8px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
        }

        .mini-progress span.done {
          background: #dcfce7;
          color: #166534;
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
        }

        @media (max-width: 1100px) {
          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
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

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid {
            grid-template-columns: 1fr;
          }

          .panel-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 14px;
          }
        }
      `}</style>
    </main>
  );
}