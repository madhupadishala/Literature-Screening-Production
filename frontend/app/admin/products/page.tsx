"use client";

import Navigation from "@/components/Navigation";

const products = [
  ["PID-001", "Paracetamol", "Acetaminophen, Tylenol", "Tablet", "India, Germany, US, UK", "Active"],
  ["PID-002", "VaxGuard", "VaxGuard Vaccine", "Injection", "US, Germany", "Active"],
  ["PID-003", "DemoDrug XR", "DemoDrug", "Capsule", "India", "Inactive"],
];

export default function ProductsPage() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Products</h1>
          <p>Product master, synonyms and MAH country configuration</p>
        </div>
        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="metrics-grid">
        <div className="metric-card"><span>Total Products</span><strong>3</strong></div>
        <div className="metric-card success"><span>Active</span><strong>2</strong></div>
        <div className="metric-card"><span>MAH Countries</span><strong>5</strong></div>
        <div className="metric-card warning"><span>Needs Review</span><strong>1</strong></div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Product Master</h2>
            <p>Deterministic registry used by the Hits Engine. Not vector-based.</p>
          </div>
          <div className="actions">
            <button>Add Product</button>
            <button>Upload Product Master</button>
            <button>Download Template</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product ID</th>
              <th>Product</th>
              <th>Synonyms</th>
              <th>Formulation</th>
              <th>MAH Countries</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map(([id, name, syn, form, mah, status]) => (
              <tr key={id}>
                <td className="mono">{id}</td>
                <td><strong>{name}</strong></td>
                <td>{syn}</td>
                <td>{form}</td>
                <td>{mah}</td>
                <td><span className={status === "Active" ? "ok" : "warn"}>{status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <style jsx>{`
        .app-shell { min-height: 100vh; background: #f4f7fb; padding: 24px; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .topbar { background: linear-gradient(135deg,#071b34,#123f68); color:white; border-radius:20px; padding:24px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 16px 36px rgba(15,23,42,.18); }
        .topbar h1 { margin:0; font-size:30px; }
        .topbar p { margin:6px 0 0; color:#cfe7ff; }
        .topbar-meta { display:flex; gap:12px; font-size:13px; }
        .topbar-meta span,.topbar-meta strong { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); padding:8px 10px; border-radius:999px; }
        .metrics-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:18px; }
        .metric-card { background:white; border:1px solid #dbe4ef; border-radius:18px; padding:20px; box-shadow:0 12px 30px rgba(15,23,42,.06); }
        .metric-card span { display:block; color:#64748b; font-size:13px; margin-bottom:8px; font-weight:800; text-transform:uppercase; }
        .metric-card strong { font-size:28px; }
        .success strong { color:#15803d; }
        .warning strong { color:#b45309; }
        .panel { background:white; border:1px solid #dbe4ef; border-radius:20px; box-shadow:0 12px 30px rgba(15,23,42,.06); overflow:hidden; }
        .panel-header { padding:24px; display:flex; justify-content:space-between; gap:16px; align-items:center; border-bottom:1px solid #e2e8f0; }
        .panel-header h2 { margin:0 0 6px; }
        .panel-header p { margin:0; color:#64748b; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; }
        button { border:none; border-radius:12px; background:#185a9d; color:white; padding:10px 14px; font-weight:800; cursor:pointer; }
        table { width:100%; border-collapse:collapse; }
        th { background:#f8fafc; color:#475569; text-align:left; padding:14px; font-size:12px; text-transform:uppercase; }
        td { padding:14px; border-top:1px solid #e2e8f0; }
        .mono { font-family:Consolas, Monaco, monospace; color:#185a9d; font-weight:800; }
        .ok,.warn { padding:6px 10px; border-radius:999px; font-size:11px; font-weight:900; text-transform:uppercase; }
        .ok { background:#dcfce7; color:#166534; }
        .warn { background:#fef3c7; color:#92400e; }
      `}</style>
    </main>
  );
}