import ReliabilityDashboard from "@/components/admin/ReliabilityDashboard";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Enterprise Reliability | ClinixAI",
  description:
    "Operational health, dependency readiness, reliability and security monitoring for ClinixAI Literature Screening.",
};

export default function ReliabilityPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Navigation />
        <InvestorDemoHeader
          eyebrow="ENTERPRISE RELIABILITY"
          title="Platform Reliability Console"
          subtitle="Live readiness, dependency latency, runtime resources, circuit protection, tenant operational failures, and durable health snapshots."
          status="Continuously Monitored"
        />
        <ReliabilityDashboard />
      </div>
    </main>
  );
}
