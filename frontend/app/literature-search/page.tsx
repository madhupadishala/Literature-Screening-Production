import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import AdHocSearchWorkspace from "@/components/literature/AdHocSearchWorkspace";

export default function LiteratureSearchPage() {
  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="RBAC-CONTROLLED LITERATURE UTILITY"
        title="Enterprise Literature Search"
        subtitle="Search by exact PMID, DOI, Brand, Generic, INN, API, Salt, Company Product ID, WHODrug ID, or Boolean query. Apply publication dates and source controls, select required articles, and create governed Evidence Packages for Hits."
        status="Available to Authorized Users"
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
