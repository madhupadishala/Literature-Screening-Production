import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import TenantConfigurationConsole from "@/components/admin/TenantConfigurationConsole";

export default function TenantConfigurationPage() {
  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="TENANT-CONTROLLED ADMINISTRATION"
        title="Configuration & Source Governance"
        subtitle="Authorized Client Owners, IT administrators, PV administrators, and Quality Approvers can maintain Product Master, Literature Calendar, Client Guidelines, Outcome Templates, and enabled literature databases without changing backend code."
        status="RBAC · Versioned · Auditable"
      />
      <TenantConfigurationConsole />

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
