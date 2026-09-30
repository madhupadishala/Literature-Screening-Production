import Link from "next/link";
import Navigation from "@/components/Navigation";
import ModuleSubNavigation from "@/components/ModuleSubNavigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

export default function DuplicateCheckPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <ModuleSubNavigation module="INTAKE" />
      <InvestorDemoHeader
        eyebrow="INTAKE · DUPLICATE CHECK"
        title="Duplicate Check"
        subtitle="Dedicated duplicate-evaluation queue for candidate case relationships before downstream case creation."
        status="Controlled Intake workflow"
      />
      <section className="grid">
          <div className="card">Candidate duplicate matching</div>
          <div className="card">Existing case relationship review</div>
          <div className="card">Human accept / reject / link decision</div>
          <div className="card">Audit reason and evidence</div>
      </section>
      <div className="entry">
        <Link href="/intake">Open Intake worklist</Link>
        <span>Record-level actions continue to use the governed Intake APIs and audit trail.</span>
      </div>
      <style>{`
        .app-shell{min-height:100vh;padding:24px;background:#eef2f7;color:#0f172a;font-family:"Poppins",Arial,sans-serif}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}
        .card{padding:18px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-size:12px;font-weight:800}
        .entry{display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}
        .entry a{color:#185abd;font-weight:900;text-decoration:none}.entry span{color:#64748b;font-size:10px}
        @media(max-width:700px){.grid{grid-template-columns:1fr}.app-shell{padding:12px}.entry{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}