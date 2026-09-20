import Navigation from "@/components/Navigation";
import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import TenantConfigurationConsole from "@/components/admin/TenantConfigurationConsole";

export default function ProductsPage() {
  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="GOVERNED PRODUCT INTELLIGENCE"
        title="Product Master & MAH Governance"
        subtitle="Maintain tenant-controlled product identity, synonyms, salts, formulation, lifecycle, country, MAH, licence effective dates, WHODrug mappings, and activation status through the versioned configuration lifecycle."
        status="RBAC · Effective-dated · Auditable"
      />

      <section className="boundary">
        <strong>Production boundary</strong>
        <span>
          Product Master determines company and MAH applicability. It does not
          control medicinal-product recognition or patient-safety detection.
        </span>
        <a href="/templates/configuration/product-master-template.csv" download>
          Download Product Master template
        </a>
      </section>

      <TenantConfigurationConsole />

      <style>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .boundary {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          margin: 0 0 16px;
          padding: 12px 14px;
          border: 1px solid #bae6fd;
          border-radius: 6px;
          color: #075985;
          background: #f0f9ff;
          font-size: 11px;
        }

        .boundary strong {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .boundary a {
          padding: 8px 10px;
          border-radius: 5px;
          color: #ffffff;
          background: #185abd;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }

        @media (max-width: 760px) {
          .app-shell { padding: 12px; }
          .boundary { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
