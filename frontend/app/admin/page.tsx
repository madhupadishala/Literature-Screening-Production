"use client";

import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

const modules = [
  {
    title: "Product Master",
    description:
      "Upload and version product identities, synonyms, salts, lifecycle, MAH, and WHODrug mappings.",
    action: "/admin/configuration",
  },
  {
    title: "Literature Calendar",
    description:
      "Maintain daily, weekly, monthly, and custom surveillance schedules with missed-search controls.",
    action: "/admin/configuration",
  },
  {
    title: "Client Guidelines",
    description:
      "Upload governed SOPs, work instructions, screening rules, and country-specific guidance.",
    action: "/admin/configuration",
  },
  {
    title: "Outcome Templates",
    description:
      "Control client output mappings, mandatory fields, validation rules, and effective versions.",
    action: "/admin/configuration",
  },
  {
    title: "Literature Sources",
    description:
      "Enable databases, configure tenant result limits, and view connector availability.",
    action: "/admin/configuration",
  },
  {
    title: "Users & Roles",
    description:
      "Manage tenant membership and role-based access for owners, IT, PV, Quality, reviewers, and auditors.",
    action: "/admin/users-roles",
  },
  {
    title: "Audit Logs",
    description:
      "Review security, workflow, search, and configuration events.",
    action: "/admin/audit-logs",
  },
  {
    title: "System Reliability",
    description:
      "View database, AI provider, evidence storage, monitoring, and release health.",
    action: "/admin/reliability",
  },
];

export default function AdminPage() {
  const router = useRouter();

  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="ADMINISTRATION"
        title="Tenant Administration Console"
        subtitle="Operational configuration is visible, tenant-controlled, versioned, permission-checked, and auditable. Secrets remain server-side and are never displayed in the browser."
        status="Controlled Administration"
      />

      <section className="module-grid">
        {modules.map((module) => (
          <button
            key={module.title}
            type="button"
            onClick={() => router.push(module.action)}
          >
            <span>Operational module</span>
            <h2>{module.title}</h2>
            <p>{module.description}</p>
            <strong>Open →</strong>
          </button>
        ))}
      </section>

      <section className="boundary">
        <strong>Literature product boundary</strong>
        <p>
          Administration supports Search, Evidence Package, Hits, Screening,
          and governed downstream output. No additional Literature workspace
          is introduced after governed output.
        </p>
      </section>

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .module-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .module-grid button {
          display: grid;
          min-height: 178px;
          align-content: start;
          padding: 16px;
          border: 1px solid #b8c4d3;
          border-radius: 4px;
          color: #0f172a;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
        }

        .module-grid button:hover {
          border-color: #185abd;
          box-shadow: 0 5px 18px rgba(24, 90, 189, 0.12);
        }

        .module-grid span {
          color: #185abd;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        h2 {
          margin: 8px 0 6px;
          font-size: 15px;
        }

        p {
          margin: 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.55;
        }

        .module-grid strong {
          align-self: end;
          margin-top: 18px;
          color: #185abd;
          font-size: 9px;
        }

        .boundary {
          margin-top: 14px;
          padding: 13px 16px;
          border: 1px solid #93c5fd;
          border-radius: 4px;
          color: #1e3a8a;
          background: #eff6ff;
        }

        .boundary strong {
          font-size: 9px;
          text-transform: uppercase;
        }

        .boundary p {
          margin-top: 4px;
          color: #1e3a8a;
        }

        @media (max-width: 1100px) {
          .module-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }

          .module-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
