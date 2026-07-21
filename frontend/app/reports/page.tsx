"use client";

import { useRouter } from "next/navigation";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

const reports = [
  {
    title: "Enterprise Audit Trail",
    description:
      "Filter and export tenant-scoped workflow, security, configuration, and evidence events.",
    action: "/admin/audit-logs",
    label: "Open Audit Report",
  },
  {
    title: "Reliability Status",
    description:
      "Review dependency readiness, incidents, workflow state distribution, and durable health signals.",
    action: "/admin/reliability",
    label: "Open Reliability Report",
  },
  {
    title: "Performance & Capacity",
    description:
      "Inspect throughput, latency percentiles, pool pressure, slow AI operations, and operating budgets.",
    action: "/admin/performance",
    label: "Open Performance Report",
  },
  {
    title: "Workflow Operations",
    description:
      "Review live package progression from governed Search through downstream output generation.",
    action: "/workflow",
    label: "Open Workflow Report",
  },
];

export default function ReportsPage() {
  const router = useRouter();
  return (
    <main className="shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="GOVERNED REPORTING"
        title="Operational Reports"
        subtitle="Authorized, tenant-isolated operational reporting sourced from production workflow, audit, reliability, and performance records."
        status="Live Data"
      />
      <section className="report-grid">
        {reports.map((report) => (
          <article key={report.title}>
            <span>Controlled report</span>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <button type="button" onClick={() => router.push(report.action)}>
              {report.label}
            </button>
          </article>
        ))}
      </section>
      <section className="boundary">
        <strong>Export governance</strong>
        <p>
          Report downloads are generated only by their owning governed module. Permissions,
          active-tenant isolation, filtering, and audit logging remain enforced at the API boundary.
        </p>
      </section>
      <style jsx>{`
        .shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, sans-serif;
        }
        .report-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        article {
          display: grid;
          min-height: 205px;
          align-content: start;
          padding: 17px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
        }
        article > span {
          color: #185abd;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.07em;
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
          line-height: 1.6;
        }
        button {
          align-self: end;
          margin-top: 22px;
          border: 0;
          border-radius: 5px;
          padding: 10px 12px;
          color: #fff;
          background: #185abd;
          font: inherit;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }
        .boundary {
          margin-top: 14px;
          padding: 14px 16px;
          border: 1px solid #93c5fd;
          border-radius: 6px;
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
          .report-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 700px) {
          .shell {
            padding: 12px;
          }
          .report-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
