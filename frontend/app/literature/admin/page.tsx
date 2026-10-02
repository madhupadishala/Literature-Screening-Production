import Link from "next/link";

import ApplicationShell from "@/components/enterprise/ApplicationShell";
import OperationalScreenHeader from "@/components/enterprise/OperationalScreenHeader";
import OperationalState from "@/components/enterprise/OperationalState";

const ADMIN = [
  { label: "Search Schedule", href: "/admin/literature-scheduler", description: "Govern scheduled searches, execution cadence and controlled operational ownership." },
  { label: "Literature Calendar", href: "/admin/literature-calendar", description: "Review upcoming searches, due activities and execution history." },
  { label: "Products", href: "/admin/products", description: "Maintain the controlled product scope used by Literature Screening." },
  { label: "Configuration", href: "/admin/configuration", description: "Review controlled configuration without bypassing role or audit controls." },
];

export default function LiteratureAdminPage() {
  return (
    <ApplicationShell module="LITERATURE">
      <OperationalScreenHeader
        eyebrow="Literature Screening · Administration"
        title="Literature Administration"
        description="Govern schedules, product scope and controlled configuration outside the PV processing worklist."
        status="RBAC controlled"
      />
      <OperationalState
        kind="read-only"
        title="Administrative boundary"
        message="Administrative screens change configuration only through their governed APIs. Processing decisions remain in Hits, Screening and Medical Review."
        compact
      />
      <section className="admin-grid" aria-label="Literature administration">
        {ADMIN.map((item) => (
          <Link className="admin-card" href={item.href} key={item.href}>
            <span>CONTROLLED ADMINISTRATION</span>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </Link>
        ))}
      </section>
      <style>{`
        .admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
        .admin-card{padding:18px;border:1px solid var(--nx-color-border);border-radius:8px;background:var(--nx-color-surface);color:var(--nx-color-text);text-decoration:none}
        .admin-card span{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;color:var(--nx-color-interactive)}
        .admin-card strong{display:block;margin-top:8px;font-size:15px}
        .admin-card p{margin:6px 0 0;color:#64748b;font-size:11px;line-height:1.55}
        .admin-card:hover{border-color:var(--nx-color-interactive)}
        @media(max-width:700px){.admin-grid{grid-template-columns:1fr}}
      `}</style>
    </ApplicationShell>
  );
}
