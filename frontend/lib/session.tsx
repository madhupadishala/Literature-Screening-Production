"use client";

import { useState } from "react";
import Navigation from "@/components/Navigation";

const tenants = [
  ["TEN-001", "Demo Tenant", "demo-tenant", "PROD", "Active", "3", "2026-07-05"],
  ["TEN-002", "Novartis Workspace", "novartis-prod", "PROD", "Active", "12", "2026-07-04"],
  ["TEN-003", "Training Workspace", "training-tenant", "TRAINING", "Active", "8", "2026-07-03"],
  ["TEN-004", "UAT Workspace", "uat-tenant", "UAT", "Needs Review", "5", "2026-07-01"],
];

export default function TenantManagementPage() {
  const [toast, setToast] = useState("");

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Tenant Management</h1>
          <p>Create and manage isolated client workspaces across environments</p>
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
          <span>Total Tenants</span>
          <strong>4</strong>
        </div>
        <div className="metric-card success">
          <span>Active</span>
          <strong>3</strong>
        </div>
        <div className="metric-card warning">
          <span>Needs Review</span>
          <strong>1</strong>
        </div>
        <div className="metric-card">
          <span>Environments</span>
          <strong>3</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Tenant Registry</h2>
            <p>
              Each tenant owns its own product master, MAH countries, calendar,
              knowledge base, evidence store, workflow and audit logs.
            </p>
          </div>

          <div className="actions">
            <button onClick={() => showToast("Create Tenant form will open here.")}>
              Create Tenant
            </button>
            <button onClick={() => showToast("Clone Tenant action selected.")}>
              Clone Tenant
            </button>
            <button onClick={() => showToast("Tenant export prepared.")}>
              Export
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Tenant ID</th>
              <th>Tenant Name</th>
              <th>Tenant Key</th>
              <th>Environment</th>
              <th>Status</th>
              <th>Users</th>
              <th>Last Updated</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {tenants.map(([id, name, key, env, status, users, updated]) => (
              <tr key={id}>
                <td className="mono">{id}</td>
                <td>
                  <strong>{name}</strong>
                </td>
                <td>{key}</td>
                <td>
                  <span className="env-pill">{env}</span>
                </td>
                <td>
                  <span className={status === "Active" ? "ok" : "warn"}>{status}</span>
                </td>
                <td>{users}</td>
                <td>{updated}</td>
                <td>
                  <button
                    className="mini-button"
                    onClick={() => showToast(`Opened tenant: ${name}`)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="info-grid">
        <div className="info-card">
          <h3>Tenant Isolation Rule</h3>
          <p>
            Products, calendars, knowledge, evidence packages, workflow outputs
            and audit logs must never be shared across tenants.
          </p>
        </div>

        <div className="info-card">
          <h3>Login Requirement</h3>
          <p>
            Username, password, environment and tenant are mandatory to create
            a valid ClinixAI session.
          </p>
        </div>

        <div className="info-card">
          <h3>Session Context</h3>
          <p>
            Every API request must carry organization, tenant, user, role,
            permissions and environment.
          </p>
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

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 18px;
        }

        .metric-card,
        .panel,
        .info-card {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .metric-card {
          padding: 20px;
        }

        .metric-card span {
          display: block;
          color: #64748b;
          font-size: 13px;
          margin-bottom: 8px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .metric-card strong {
          font-size: 28px;
        }

        .success strong {
          color: #15803d;
        }

        .warning strong {
          color: #b45309;
        }

        .panel {
          overflow: hidden;
          margin-bottom: 18px;
        }

        .panel-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
        }

        .panel-header h2 {
          margin: 0 0 6px;
        }

        .panel-header p {
          margin: 0;
          color: #64748b;
          line-height: 1.5;
          max-width: 760px;
        }

        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .mini-button {
          padding: 7px 10px;
          font-size: 12px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          background: #f8fafc;
          color: #475569;
          text-align: left;
          padding: 14px;
          font-size: 12px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        td {
          padding: 14px;
          border-top: 1px solid #e2e8f0;
          vertical-align: middle;
        }

        .mono {
          font-family: Consolas, Monaco, monospace;
          color: #185a9d;
          font-weight: 800;
        }

        .ok,
        .warn,
        .env-pill {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .ok {
          background: #dcfce7;
          color: #166534;
        }

        .warn {
          background: #fef3c7;
          color: #92400e;
        }

        .env-pill {
          background: #e0f2fe;
          color: #075985;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .info-card {
          padding: 20px;
        }

        .info-card h3 {
          margin: 0 0 10px;
        }

        .info-card p {
          margin: 0;
          color: #475569;
          line-height: 1.6;
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

        @media (max-width: 1000px) {
          .metrics-grid,
          .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .topbar,
          .panel-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .topbar-meta {
            flex-wrap: wrap;
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .metrics-grid,
          .info-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}