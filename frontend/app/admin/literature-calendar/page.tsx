"use client";

import Navigation from "@/components/Navigation";

const schedules = [
  ["Paracetamol", "Broad PubMed Search", "Weekly", "Monday", "2026-07-06", "PV Lead", "Active"],
  ["VaxGuard", "Vaccine AE Search", "Daily", "Every Day", "2026-07-05", "Super User", "Active"],
  ["DemoDrug XR", "Brand + Generic Search", "Monthly", "1st", "2026-08-01", "Client Admin", "Review"],
];

export default function LiteratureCalendarPage() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Literature Calendar</h1>
          <p>Product-wise literature search schedule and workflow trigger planning</p>
        </div>
        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Scheduled Literature Searches</h2>
            <p>Controls when evidence packages are created for workflow processing.</p>
          </div>
          <div className="actions">
            <button>Add Schedule</button>
            <button>Run Due Searches</button>
            <button>Export Calendar</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Search Strategy</th>
              <th>Frequency</th>
              <th>Search Day</th>
              <th>Next Run</th>
              <th>Owner</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map(([product, strategy, freq, day, next, owner, status]) => (
              <tr key={product}>
                <td><strong>{product}</strong></td>
                <td>{strategy}</td>
                <td>{freq}</td>
                <td>{day}</td>
                <td>{next}</td>
                <td>{owner}</td>
                <td><span className={status === "Active" ? "ok" : "warn"}>{status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="note-panel">
        <h3>Operational Rule</h3>
        <p>
          The calendar creates evidence packages only. Hits, Screening and intake_input.json are handled by the workflow engine.
        </p>
      </section>

      <style jsx>{`
        .app-shell { min-height:100vh; background:#f4f7fb; padding:24px; color:#0f172a; font-family:Arial, Helvetica, sans-serif; }
        .topbar { background:linear-gradient(135deg,#071b34,#123f68); color:white; border-radius:20px; padding:24px 28px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 16px 36px rgba(15,23,42,.18); }
        .topbar h1 { margin:0; font-size:30px; }
        .topbar p { margin:6px 0 0; color:#cfe7ff; }
        .topbar-meta { display:flex; gap:12px; font-size:13px; }
        .topbar-meta span,.topbar-meta strong { background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.2); padding:8px 10px; border-radius:999px; }
        .panel,.note-panel { background:white; border:1px solid #dbe4ef; border-radius:20px; box-shadow:0 12px 30px rgba(15,23,42,.06); overflow:hidden; margin-bottom:18px; }
        .panel-header { padding:24px; display:flex; justify-content:space-between; gap:16px; align-items:center; border-bottom:1px solid #e2e8f0; }
        .panel-header h2 { margin:0 0 6px; }
        .panel-header p,.note-panel p { margin:0; color:#64748b; line-height:1.6; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; }
        button { border:none; border-radius:12px; background:#185a9d; color:white; padding:10px 14px; font-weight:800; cursor:pointer; }
        table { width:100%; border-collapse:collapse; }
        th { background:#f8fafc; color:#475569; text-align:left; padding:14px; font-size:12px; text-transform:uppercase; }
        td { padding:14px; border-top:1px solid #e2e8f0; }
        .ok,.warn { padding:6px 10px; border-radius:999px; font-size:11px; font-weight:900; text-transform:uppercase; }
        .ok { background:#dcfce7; color:#166534; }
        .warn { background:#fef3c7; color:#92400e; }
        .note-panel { padding:20px; }
        .note-panel h3 { margin:0 0 8px; }
      `}</style>
    </main>
  );
}