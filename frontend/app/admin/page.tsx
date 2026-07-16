"use client";

import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";

type AdminModule = {
  title: string;
  group: string;
  description: string;
  path: string;
  status: "Active" | "Configured" | "Needs Review" | "Planned";
  items: string[];
};

const ADMIN_MODULES: AdminModule[] = [
  {
    title: "Users & Roles",
    group: "Access Management",
    description: "Manage users, roles, permissions, tenant access and login controls.",
    path: "/admin/users-roles",
    status: "Active",
    items: ["Users", "Roles", "Permissions", "Access status"],
  },
  {
    title: "Products",
    group: "Business Configuration",
    description: "Maintain product master, synonyms, MAH countries and product rules.",
    path: "/admin/products",
    status: "Configured",
    items: ["Product master", "Synonyms", "MAH countries", "Upload list"],
  },
  {
    title: "Literature Calendar",
    group: "Business Configuration",
    description: "Configure product-wise literature schedules, frequency and next run date.",
    path: "/admin/literature-calendar",
    status: "Needs Review",
    items: ["Search schedule", "Frequency", "Owner", "Next run"],
  },
  {
    title: "Knowledge Base",
    group: "AI Operations",
    description: "Manage General PV rules, client SOP/WI, tenant overrides and vector index.",
    path: "/admin/knowledge-base",
    status: "Active",
    items: ["General PV", "Client SOP/WI", "Tenant rules", "Vector DB"],
  },
  {
    title: "Client Configuration",
    group: "Tenant Configuration",
    description: "Configure tenant settings, screening rules, COI rules and export behavior.",
    path: "/admin/client-configuration",
    status: "Configured",
    items: ["Tenant profile", "Screening rules", "COI rules", "Exports"],
  },
  {
    title: "System Settings",
    group: "System Configuration",
    description: "Manage time zone, email, notifications, environment and storage settings.",
    path: "/admin/system-settings",
    status: "Needs Review",
    items: ["Time zone", "Emails", "Notifications", "Environment"],
  },
  {
    title: "Audit Logs",
    group: "Compliance",
    description: "Search user actions, workflow changes, overrides, downloads and configuration changes.",
    path: "/admin/audit-logs",
    status: "Active",
    items: ["User actions", "Workflow logs", "Overrides", "Downloads"],
  },
  {
    title: "Reports",
    group: "Compliance",
    description: "Generate admin exports, validation summaries, workflow and audit reports.",
    path: "/admin/reports",
    status: "Planned",
    items: ["Workflow report", "Hits export", "Screening export", "Audit export"],
  },
  {
    title: "Super User Console",
    group: "Operations",
    description: "Operational control room for search, override, route back, QC and comments.",
    path: "/admin/super-user-console",
    status: "Planned",
    items: ["Search article", "Override", "QC action", "Route back"],
  },
];

function statusClass(status: AdminModule["status"]) {
  if (status === "Active") return "active";
  if (status === "Configured") return "configured";
  if (status === "Needs Review") return "review";
  return "planned";
}

export default function AdminPage() {
  const router = useRouter();

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <h1>ClinixAI</h1>
          <p>Administration Console</p>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <strong>PROD</strong>
        </div>
      </section>

      <Navigation />

      <section className="admin-hero">
        <div>
          <span>Administration</span>
          <h2>ClinixAI Literature Screening Admin Panel</h2>
          <p>
            Central administration for access, products, literature calendar, knowledge governance,
            client configuration, system settings, audit logs and operational supervision.
          </p>
        </div>

        <div className="admin-score">
          <strong>{ADMIN_MODULES.length}</strong>
          <span>Admin Modules</span>
        </div>
      </section>

      <section className="console-grid">
        {ADMIN_MODULES.map((module) => (
          <button
            key={module.path}
            className="module-card"
            onClick={() => router.push(module.path)}
          >
            <div className="module-top">
              <span>{module.group}</span>
              <em className={statusClass(module.status)}>{module.status}</em>
            </div>

            <h3>{module.title}</h3>
            <p>{module.description}</p>

            <div className="module-items">
              {module.items.map((item) => (
                <small key={item}>{item}</small>
              ))}
            </div>
          </button>
        ))}
      </section>

      <section className="admin-footer-grid">
        <div className="footer-panel">
          <h3>RBAC Model</h3>
          <p>ClinixAI Super Admin → Client Admin → Super User → QC Reviewer → Read Only / Auditor / Training</p>
        </div>

        <div className="footer-panel">
          <h3>System Health</h3>
          <p>Workflow API: Online · Knowledge Router: Online · Vector DB: Local · LLM Provider: Connected</p>
        </div>

        <div className="footer-panel">
          <h3>Boundary</h3>
          <p>Literature Screening V1 ends at intake_input.json. Case processing and submission are not part of this module.</p>
        </div>
      </section>

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

        .admin-hero {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: center;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .admin-hero span {
          color: #185a9d;
          font-weight: 900;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.5px;
        }

        .admin-hero h2 {
          margin: 8px 0;
          font-size: 28px;
        }

        .admin-hero p {
          margin: 0;
          color: #475569;
          line-height: 1.6;
          max-width: 900px;
        }

        .admin-score {
          min-width: 140px;
          min-height: 115px;
          border-radius: 18px;
          background: #e0f2fe;
          color: #075985;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .admin-score strong {
          font-size: 42px;
        }

        .admin-score span {
          color: #075985;
        }

        .console-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }

        .module-card {
          text-align: left;
          border: 1px solid #dbe4ef;
          background: #ffffff;
          border-radius: 20px;
          padding: 20px;
          cursor: pointer;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .module-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.1);
        }

        .module-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
        }

        .module-top span {
          color: #185a9d;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        em {
          font-style: normal;
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        em.active,
        em.configured {
          background: #dcfce7;
          color: #166534;
        }

        em.review {
          background: #fef3c7;
          color: #92400e;
        }

        em.planned {
          background: #e2e8f0;
          color: #475569;
        }

        .module-card h3 {
          margin: 0 0 10px;
          font-size: 20px;
          color: #0f172a;
        }

        .module-card p {
          margin: 0 0 16px;
          color: #475569;
          line-height: 1.55;
        }

        .module-items {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .module-items small {
          background: #f1f5f9;
          color: #334155;
          border-radius: 999px;
          padding: 6px 9px;
          font-weight: 800;
          font-size: 11px;
        }

        .admin-footer-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          margin-top: 18px;
        }

        .footer-panel {
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .footer-panel h3 {
          margin: 0 0 10px;
        }

        .footer-panel p {
          margin: 0;
          color: #475569;
          line-height: 1.6;
        }

        @media (max-width: 1100px) {
          .console-grid,
          .admin-footer-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .topbar,
          .admin-hero {
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

          .console-grid,
          .admin-footer-grid {
            grid-template-columns: 1fr;
          }

          .admin-score {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}