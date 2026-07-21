import ReleaseReadinessDashboard from "../../../components/admin/ReleaseReadinessDashboard";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

export const dynamic = "force-dynamic";

export default function ReleaseReadinessPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Navigation />
        <InvestorDemoHeader
          eyebrow="PRODUCTION RELEASE"
          title="Release Readiness & Candidate Governance"
          subtitle="Governed UAT evidence, release gates, smoke validation, rollback controls, immutable release state, and release-owner authorization."
          status="Gate Controlled"
        />
        <ReleaseReadinessDashboard />
      </div>
    </main>
  );
}
