"use client";

import Navigation from "@/components/Navigation";

const roles = [
  ["ClinixAI Super Admin", "ClinixAI internal platform owner with full system access"],
  ["Client Admin", "Client-side owner for users, roles, products and configuration"],
  ["Super User", "Operational lead for reruns, overrides, route backs and QC support"],
  ["QC Reviewer", "Reviews AI-generated Hits and Screening outputs"],
  ["Read Only / Auditor / Training", "View-only role for audits, inspections, demos and training"],
];

const users = [
  ["Madhu", "ClinixAI Super Admin", "Active", "PROD", "Today"],
  ["Client Owner", "Client Admin", "Active", "PROD", "Yesterday"],
  ["PV Lead", "Super User", "Active", "PROD", "Today"],
  ["QC User", "QC Reviewer", "Active", "PROD", "Today"],
  ["Auditor", "Read Only / Auditor / Training", "Inactive", "PROD", "—"],
];

export default function UsersRolesPage() {
  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>Users & Roles</h1>
          <p>Access management for ClinixAI Literature Screening V1</p>
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
            <h2>User Management</h2>
            <p>Create, disable and assign role-based access.</p>
          </div>
          <div className="actions">
            <button>Create User</button>
            <button>Assign Role</button>
            <button>Deactivate</button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Environment</th>
              <th>Last Login</th>
            </tr>
          </thead>
          <tbody>
            {users.map(([user, role, status, env, login]) => (
              <tr key={user}>
                <td>{user}</td>
                <td>{role}</td>
                <td><span className={status === "Active" ? "ok" : "warn"}>{status}</span></td>
                <td>{env}</td>
                <td>{login}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>RBAC Hierarchy</h2>
            <p>ClinixAI Super Admin → Client Admin → Super User → QC Reviewer → Read Only / Auditor / Training</p>
          </div>
        </div>

        <div className="role-grid">
          {roles.map(([role, desc]) => (
            <div className="role-card" key={role}>
              <strong>{role}</strong>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <style jsx>{`
        .app-shell { min-height: 100vh; background: #f4f7fb; padding: 24px; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .topbar { background: linear-gradient(135deg, #071b34, #123f68); color: white; border-radius: 20px; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 16px 36px rgba(15,23,42,.18); }
        .topbar h1 { margin: 0; font-size: 30px; }
        .topbar p { margin: 6px 0 0; color: #cfe7ff; }
        .topbar-meta { display: flex; gap: 12px; font-size: 13px; }
        .topbar-meta span, .topbar-meta strong { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2); padding: 8px 10px; border-radius: 999px; }
        .panel { background: white; border: 1px solid #dbe4ef; border-radius: 20px; box-shadow: 0 12px 30px rgba(15,23,42,.06); margin-bottom: 18px; overflow: hidden; }
        .panel-header { padding: 24px; display: flex; justify-content: space-between; gap: 16px; align-items: center; border-bottom: 1px solid #e2e8f0; }
        .panel-header h2 { margin: 0 0 6px; }
        .panel-header p { margin: 0; color: #64748b; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; }
        button { border: none; border-radius: 12px; background: #185a9d; color: white; padding: 10px 14px; font-weight: 800; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8fafc; color: #475569; text-align: left; padding: 14px; font-size: 12px; text-transform: uppercase; }
        td { padding: 14px; border-top: 1px solid #e2e8f0; }
        .ok, .warn { padding: 6px 10px; border-radius: 999px; font-size: 11px; font-weight: 900; text-transform: uppercase; }
        .ok { background: #dcfce7; color: #166534; }
        .warn { background: #fef3c7; color: #92400e; }
        .role-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 24px; }
        .role-card { border: 1px solid #e2e8f0; border-radius: 16px; background: #f8fafc; padding: 16px; }
        .role-card strong { color: #185a9d; }
        .role-card p { color: #475569; line-height: 1.5; }
      `}</style>
    </main>
  );
}