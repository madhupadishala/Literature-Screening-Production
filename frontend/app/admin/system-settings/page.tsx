"use client";

import { useState } from "react";
import Navigation from "@/components/Navigation";

const settings = [
  ["Environment", "PROD", "Active"],
  ["Time Zone", "Asia/Kolkata", "Configured"],
  ["Email Service", "SMTP Pending", "Needs Review"],
  ["Notification Mode", "Email", "Configured"],
  ["Evidence Store", "Local evidence_store", "Configured"],
  ["Vector DB", "Local Chroma", "Configured"],
  ["LLM Provider", "Groq", "Connected"],
];

export default function SystemSettingsPage() {
  const [toast, setToast] = useState("");

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>System Settings</h1>
          <p>Environment, time zone, email, storage, vector DB and provider health</p>
        </div>
        <div className="topbar-meta">
          <span>Tenant: Demo Tenant</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Platform Settings</h2>
            <p>System configuration for the selected tenant and environment.</p>
          </div>
          <div className="actions">
            <button onClick={() => showToast("Settings saved.")}>Save</button>
            <button onClick={() => showToast("Health check completed.")}>Health Check</button>
            <button onClick={() => showToast("Backup requested.")}>Backup</button>
            <button onClick={() => showToast("Settings exported.")}>Export</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Value</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {settings.map(([setting, value, status]) => (
              <tr key={setting}>
                <td><strong>{setting}</strong></td>
                <td>{value}</td>
                <td><span className={status === "Needs Review" ? "warn" : "ok"}>{status}</span></td>
                <td><button className="mini-button" onClick={() => showToast(`Opened ${setting}`)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid">
        <div className="card"><h3>Environment</h3><p>PROD, UAT and TRAINING should remain isolated.</p></div>
        <div className="card"><h3>Email</h3><p>Email and notification settings are tenant-aware.</p></div>
        <div className="card"><h3>Storage</h3><p>Evidence, workflow and audit storage must be tenant-scoped.</p></div>
      </section>

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell { min-height:100vh; background:#f4f7fb; padding:24px; color:#0f172a; font-family:Arial, Helvetica, sans-serif; }
        .topbar { background:linear-gradient(135deg,#071b34,#123f68); color:white; border-radius:20px; padding:24px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 16px 36px rgba(15,23,42,.18); }
        .topbar h1 { margin:0; font-size:30px; }
        .topbar p { margin:6px 0 0; color:#cfe7ff; }
        .topbar-meta { display:flex; gap:12px; font-size:13px; }
        .topbar-meta span,.topbar-meta strong { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); padding:8px 10px; border-radius:999px; }
        .panel,.card { background:white; border:1px solid #dbe4ef; border-radius:18px; box-shadow:0 12px 30px rgba(15,23,42,.06); }
        .panel { overflow:hidden; margin-bottom:18px; }
        .panel-header { padding:24px; display:flex; justify-content:space-between; gap:16px; align-items:center; border-bottom:1px solid #e2e8f0; }
        .panel-header h2 { margin:0 0 6px; }
        .panel-header p,.card p { margin:0; color:#64748b; line-height:1.6; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; }
        button { border:none; border-radius:12px; background:#185a9d; color:white; padding:10px 14px; font-weight:800; cursor:pointer; }
        .mini-button { padding:7px 10px; font-size:12px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#f8fafc; color:#475569; text-align:left; padding:14px; font-size:12px; text-transform:uppercase; }
        td { padding:14px; border-top:1px solid #e2e8f0; }
        .ok,.warn { padding:6px 10px; border-radius:999px; font-size:11px; font-weight:900; text-transform:uppercase; }
        .ok { background:#dcfce7; color:#166534; }
        .warn { background:#fef3c7; color:#92400e; }
        .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .card { padding:20px; }
        .card h3 { margin:0 0 10px; }
        .toast { position:fixed; right:24px; bottom:24px; background:#0f172a; color:white; padding:14px 18px; border-radius:14px; box-shadow:0 14px 32px rgba(15,23,42,.28); font-weight:700; z-index:50; }
      `}</style>
    </main>
  );
}