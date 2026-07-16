"use client";

import { useState } from "react";
import Navigation from "@/components/Navigation";

const knowledgeItems = [
  ["General PV Rules", "general_pv", "Active", "142 rules", "2026-07-05"],
  ["Tenant SOP/WI Rules", "demo-tenant", "Active", "38 rules", "2026-07-05"],
  ["Special Situation Rules", "general_pv", "Needs Review", "21 rules", "2026-07-04"],
  ["Exclusion Rules", "demo-tenant", "Active", "14 rules", "2026-07-04"],
  ["Vector Index", "demo-tenant", "Indexed", "204 chunks", "2026-07-05"],
];

export default function KnowledgeBasePage() {
  const [toast, setToast] = useState("");

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Knowledge Base</h1>
          <p>General PV rules, tenant SOP/WI, overrides, vector index and RAG governance</p>
        </div>
        <div className="topbar-meta">
          <span>Tenant: Demo Tenant</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="metrics-grid">
        <div className="metric-card"><span>Knowledge Sets</span><strong>5</strong></div>
        <div className="metric-card success"><span>Indexed Chunks</span><strong>204</strong></div>
        <div className="metric-card"><span>Tenant Rules</span><strong>38</strong></div>
        <div className="metric-card warning"><span>Needs Review</span><strong>1</strong></div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Knowledge Registry</h2>
            <p>Tenant-specific rules override general PV rules through the Knowledge Router.</p>
          </div>
          <div className="actions">
            <button onClick={() => showToast("Upload SOP selected.")}>Upload SOP</button>
            <button onClick={() => showToast("Upload WI selected.")}>Upload WI</button>
            <button onClick={() => showToast("Create atomic rule selected.")}>Create Rule</button>
            <button onClick={() => showToast("Vector index rebuild requested.")}>Rebuild Index</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Knowledge Area</th>
              <th>Scope</th>
              <th>Status</th>
              <th>Volume</th>
              <th>Last Updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {knowledgeItems.map(([area, scope, status, volume, updated]) => (
              <tr key={area}>
                <td><strong>{area}</strong></td>
                <td>{scope}</td>
                <td><span className={status === "Needs Review" ? "warn" : "ok"}>{status}</span></td>
                <td>{volume}</td>
                <td>{updated}</td>
                <td><button className="mini-button" onClick={() => showToast(`Opened ${area}`)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="note-panel">
        <h3>Knowledge Rule</h3>
        <p>
          Agents must not read SOP/WI files directly. They must receive knowledge through the
          Knowledge Router and Agent Context Pack with citations.
        </p>
      </section>

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell { min-height:100vh; background:#f4f7fb; padding:24px; color:#0f172a; font-family:Arial, Helvetica, sans-serif; }
        .topbar { background:linear-gradient(135deg,#071b34,#123f68); color:white; border-radius:20px; padding:24px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 16px 36px rgba(15,23,42,.18); }
        .topbar h1 { margin:0; font-size:30px; }
        .topbar p { margin:6px 0 0; color:#cfe7ff; }
        .topbar-meta { display:flex; gap:12px; font-size:13px; }
        .topbar-meta span,.topbar-meta strong { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); padding:8px 10px; border-radius:999px; }
        .metrics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:18px; }
        .metric-card,.panel,.note-panel { background:white; border:1px solid #dbe4ef; border-radius:18px; box-shadow:0 12px 30px rgba(15,23,42,.06); }
        .metric-card { padding:20px; }
        .metric-card span { display:block; color:#64748b; font-size:13px; margin-bottom:8px; font-weight:800; text-transform:uppercase; }
        .metric-card strong { font-size:28px; }
        .success strong { color:#15803d; }
        .warning strong { color:#b45309; }
        .panel { overflow:hidden; margin-bottom:18px; }
        .panel-header { padding:24px; display:flex; justify-content:space-between; gap:16px; align-items:center; border-bottom:1px solid #e2e8f0; }
        .panel-header h2 { margin:0 0 6px; }
        .panel-header p,.note-panel p { margin:0; color:#64748b; line-height:1.6; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; }
        button { border:none; border-radius:12px; background:#185a9d; color:white; padding:10px 14px; font-weight:800; cursor:pointer; }
        .mini-button { padding:7px 10px; font-size:12px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#f8fafc; color:#475569; text-align:left; padding:14px; font-size:12px; text-transform:uppercase; }
        td { padding:14px; border-top:1px solid #e2e8f0; }
        .ok,.warn { padding:6px 10px; border-radius:999px; font-size:11px; font-weight:900; text-transform:uppercase; }
        .ok { background:#dcfce7; color:#166534; }
        .warn { background:#fef3c7; color:#92400e; }
        .note-panel { padding:20px; }
        .note-panel h3 { margin:0 0 8px; }
        .toast { position:fixed; right:24px; bottom:24px; background:#0f172a; color:white; padding:14px 18px; border-radius:14px; box-shadow:0 14px 32px rgba(15,23,42,.28); font-weight:700; z-index:50; }
      `}</style>
    </main>
  );
}