import Link from "next/link";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";

type UtilityItem = {
  title: string;
  description: string;
  href: string;
  category: "OPERATIONS" | "GOVERNANCE" | "SYSTEM";
  status: string;
};

const utilities: UtilityItem[] = [
  {
    title: "Operational Reports",
    description:
      "Open governed workflow, reliability, audit and performance reporting from one workspace.",
    href: "/reports",
    category: "OPERATIONS",
    status: "Live",
  },
  {
    title: "Workflow Manager",
    description:
      "Review package progression, current stage and downstream workflow state.",
    href: "/workflow",
    category: "OPERATIONS",
    status: "Live",
  },
  {
    title: "Enterprise Audit Trail",
    description:
      "Inspect tenant-scoped workflow, security, configuration and evidence events.",
    href: "/admin/audit-logs",
    category: "GOVERNANCE",
    status: "Permission controlled",
  },
  {
    title: "System Health",
    description:
      "Check critical dependency readiness, incidents and service health before operational work.",
    href: "/admin/reliability",
    category: "SYSTEM",
    status: "Live",
  },
  {
    title: "Performance & Capacity",
    description:
      "Review throughput, latency, connection-pool pressure and operational performance signals.",
    href: "/admin/performance",
    category: "SYSTEM",
    status: "Permission controlled",
  },
  {
    title: "Literature Search",
    description:
      "Start an ad-hoc governed literature search and move results into the safety workflow.",
    href: "/literature-search",
    category: "OPERATIONS",
    status: "Live",
  },
];

const groups = [
  {
    key: "OPERATIONS" as const,
    eyebrow: "Operational utilities",
    title: "Work & reporting",
    description: "Shortcuts for daily workflow, search and reporting work.",
  },
  {
    key: "GOVERNANCE" as const,
    eyebrow: "Controlled utilities",
    title: "Governance & audit",
    description: "Permission-controlled utilities for traceability and controlled review.",
  },
  {
    key: "SYSTEM" as const,
    eyebrow: "Platform utilities",
    title: "Health & performance",
    description: "Live operational checks for platform readiness and capacity.",
  },
];

export default function UtilitiesPage() {
  return (
    <ApplicationShell>
      <OperationalScreenHeader
        eyebrow="Nexus Utilities"
        title="Utilities"
        description="A single, dense workspace for operational shortcuts, governed reporting, audit visibility and platform health."
        status="Controlled workspace"
      />

      <section className="context-strip" aria-label="Contextual utilities">
        <div>
          <span>Contextual case actions</span>
          <strong>Save · Evidence Package · E2B(R3)</strong>
          <p>
            These actions remain available only inside an eligible case workspace so regulated outputs stay tied to the active record.
          </p>
        </div>
        <Link href="/cases">Open Case Processing</Link>
      </section>

      <div className="utility-groups">
        {groups.map((group) => {
          const items = utilities.filter((item) => item.category === group.key);
          return (
            <section key={group.key} className="utility-group" aria-labelledby={`utilities-${group.key.toLowerCase()}`}>
              <header>
                <span>{group.eyebrow}</span>
                <h2 id={`utilities-${group.key.toLowerCase()}`}>{group.title}</h2>
                <p>{group.description}</p>
              </header>

              <div className="utility-grid">
                {items.map((item) => (
                  <Link key={item.href} href={item.href} className="utility-card">
                    <div className="card-topline">
                      <span>{item.status}</span>
                      <span aria-hidden="true">Open</span>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <style>{`
        .context-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin-bottom: 18px;
          padding: 16px 18px;
          border: 1px solid #cbd5e1;
          border-left: 4px solid #185abd;
          border-radius: 6px;
          background: #ffffff;
        }
        .context-strip span,
        .utility-group header > span,
        .card-topline {
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .context-strip strong {
          display: block;
          margin-top: 4px;
          font-size: 12px;
        }
        .context-strip p,
        .utility-group header p,
        .utility-card p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 10px;
          line-height: 1.55;
        }
        .context-strip a {
          min-width: 142px;
          padding: 10px 13px;
          border: 1px solid #185abd;
          border-radius: 5px;
          color: #185abd;
          background: #ffffff;
          font-size: 9px;
          font-weight: 900;
          text-align: center;
          text-decoration: none;
        }
        .context-strip a:hover {
          color: #ffffff;
          background: #185abd;
        }
        .utility-groups {
          display: grid;
          gap: 16px;
        }
        .utility-group {
          display: grid;
          grid-template-columns: 210px minmax(0, 1fr);
          gap: 18px;
          padding: 16px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #f8fafc;
        }
        .utility-group header {
          padding: 4px 2px;
        }
        .utility-group h2 {
          margin: 5px 0 0;
          font-size: 14px;
          color: #0f172a;
        }
        .utility-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .utility-card {
          min-height: 132px;
          padding: 14px;
          border: 1px solid #d7dee8;
          border-radius: 5px;
          color: #0f172a;
          background: #ffffff;
          text-decoration: none;
          transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
        }
        .utility-card:hover {
          transform: translateY(-1px);
          border-color: #185abd;
          box-shadow: 0 5px 14px rgba(15, 23, 42, 0.08);
        }
        .utility-card:focus-visible {
          outline: 3px solid rgba(24, 90, 189, 0.2);
          outline-offset: 2px;
        }
        .card-topline {
          display: flex;
          justify-content: space-between;
          gap: 10px;
        }
        .card-topline span:first-child {
          color: #185abd;
        }
        .utility-card strong {
          display: block;
          margin-top: 14px;
          font-size: 13px;
        }
        @media (max-width: 980px) {
          .utility-group {
            grid-template-columns: 1fr;
          }
          .utility-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 700px) {
          .context-strip {
            align-items: stretch;
            flex-direction: column;
          }
          .context-strip a {
            width: 100%;
          }
          .utility-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </ApplicationShell>
  );
}
