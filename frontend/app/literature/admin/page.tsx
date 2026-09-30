import Link from "next/link";
import Navigation from "@/components/Navigation";
import ModuleSubNavigation from "@/components/ModuleSubNavigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

const ADMIN = [
  { label: "Search Schedule", href: "/admin/literature-scheduler" },
  { label: "Literature Calendar", href: "/admin/literature-calendar" },
  { label: "Products", href: "/admin/products" },
  { label: "Configuration", href: "/admin/configuration" },
];

export default function LiteratureAdminPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <ModuleSubNavigation module="LITERATURE" />
      <InvestorDemoHeader
        eyebrow="LITERATURE SCREENING · ADMINISTRATION"
        title="Literature Administration"
        subtitle="Govern literature schedules, product scope and controlled configuration without mixing administration into the PV processing workflow."
        status="RBAC controlled"
      />
      <section className="grid">
        {ADMIN.map((item) => <Link className="card" href={item.href} key={item.href}>{item.label}</Link>)}
      </section>
      <style>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .card{padding:20px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;text-decoration:none;font-size:13px;font-weight:900}
        .card:hover{border-color:#185abd;color:#185abd}
        @media(max-width:700px){.grid{grid-template-columns:1fr}.app-shell{padding:12px}}
      `}</style>
    </main>
  );
}