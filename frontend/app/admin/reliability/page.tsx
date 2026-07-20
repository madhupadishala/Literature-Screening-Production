import ReliabilityDashboard from "@/components/admin/ReliabilityDashboard";

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
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">
            Sprint 5
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Enterprise Reliability
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Live monitoring for service readiness, dependency health, runtime resources,
            circuit protection and security controls.
          </p>
        </div>
        <ReliabilityDashboard />
      </div>
    </main>
  );
}
