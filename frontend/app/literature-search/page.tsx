import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import AdHocSearchWorkspace from "@/components/literature/AdHocSearchWorkspace";

export default function LiteratureSearchPage() {
  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="RBAC-CONTROLLED SEARCH UTILITY"
        title="Enterprise Literature Search"
        subtitle="Use this surface either for non-production testing / validation or for an explicitly declared manual production search. Test searches remain outside the PV workflow unless a selected article is deliberately promoted to Hits."
        status="Execution purpose must be explicit"
      />
      <AdHocSearchWorkspace />

      <style>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
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
