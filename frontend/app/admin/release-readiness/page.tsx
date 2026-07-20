import ReleaseReadinessDashboard from "../../../components/admin/ReleaseReadinessDashboard";

export const dynamic = "force-dynamic";

export default function ReleaseReadinessPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Sprint 6
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Production Readiness &amp; Release Candidate
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Governed UAT evidence, release gates, smoke validation, rollback controls and
            release-candidate authorization for the Literature Screening platform.
          </p>
        </div>
        <ReleaseReadinessDashboard />
      </div>
    </main>
  );
}
