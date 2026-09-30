import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";

export default function SubmissionsPage() {
  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="SAFETY OPERATIONS · SUBMISSIONS"
        title="Submissions Workspace"
        subtitle="Prepare, track, and govern finalized safety cases for downstream regulatory submission workflows."
        status="Foundation available"
      />

      <section className="panel">
        <div>
          <span className="eyebrow">SUBMISSIONS</span>
          <h2>Submission operations</h2>
          <p>
            The submissions service foundation is available. This landing screen
            will become the entry point for submission preparation, transport,
            acknowledgement tracking, retries, and submission history.
          </p>
        </div>
      </section>

      <style>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }
        .panel {
          display: flex;
          align-items: center;
          min-height: 220px;
          padding: 28px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
        }
        .eyebrow {
          color: #185abd;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        h2 {
          margin: 8px 0;
          font-size: 26px;
        }
        p {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.7;
        }
        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }
        }
      `}</style>
    </main>
  );
}