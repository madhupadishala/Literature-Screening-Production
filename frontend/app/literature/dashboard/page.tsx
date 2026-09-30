import Link from "next/link";
import Navigation from "@/components/Navigation";
import ModuleSubNavigation from "@/components/ModuleSubNavigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

const WORKFLOW = [
  { label: "Hits", href: "/hits", description: "Review retrieved literature, duplicates, product matches and AI relevance suggestions." },
  { label: "Screening", href: "/screening", description: "Perform human literature relevance and patient-safety screening decisions." },
  { label: "Medical Review", href: "/review", description: "Complete medical review, listedness/expectedness and causality assessment." },
];

export default function LiteratureDashboardPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <ModuleSubNavigation module="LITERATURE" />
      <InvestorDemoHeader
        eyebrow="LITERATURE SCREENING · DASHBOARD"
        title="Literature Screening Dashboard"
        subtitle="Operational entry point for the literature safety workflow and user workload."
        status="Controlled workspace"
      />
      <section className="grid">
        {WORKFLOW.map((item) => (
          <Link key={item.href} href={item.href} className="card">
            <span>PV WORKFLOW</span>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </Link>
        ))}
      </section>
      <section className="assessment">
        <span>SHARED SAFETY ASSESSMENT</span>
        <strong>Seriousness · Listedness / Expectedness · Causality</strong>
        <p>These assessments use the common governed safety-assessment layer and are surfaced contextually in Screening, Medical Review, Intake and Case Processing.</p>
      </section>
      <style>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:14px}
        .card,.assessment{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:20px;text-decoration:none;color:inherit}
        .card span,.assessment span{font-size:8px;font-weight:900;letter-spacing:.08em;color:#185abd}
        .card strong,.assessment strong{display:block;margin-top:8px;font-size:18px}
        .card p,.assessment p{margin:8px 0 0;color:#64748b;font-size:11px;line-height:1.6}
        .card:hover{border-color:#185abd}
        @media(max-width:800px){.grid{grid-template-columns:1fr}.app-shell{padding:12px}}
      `}</style>
    </main>
  );
}