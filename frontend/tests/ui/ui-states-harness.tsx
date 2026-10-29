import React from "react";
import { createRoot } from "react-dom/client";
import { DataTable, type Column } from "../../components/ui/DataTable";
import "../../app/design-tokens.css";
import "../../app/globals.css";

type Sample = { id: string; label: string };
const rows: Sample[] = [{ id: "LIT-101", label: "Regulated safety record" }];
const columns: Column<Sample>[] = [
  { key: "id", header: "Record ID", render: row => row.id },
  { key: "label", header: "Description", render: row => row.label },
];

function Fixture() {
  const [retries, setRetries] = React.useState(0);
  return (
    <div style={{ padding: "24px", display: "grid", gap: "24px" }}>
      <h1>NEXUS DataTable state contract</h1>
      <section aria-label="Loading state">
        <DataTable rows={[]} columns={columns} rowKey={row => row.id} loading />
      </section>
      <section aria-label="Empty state">
        <DataTable
          rows={[]}
          columns={columns}
          rowKey={row => row.id}
          emptyMessage="No safety records were returned by the server."
          emptyAction={{ label: "Clear filters", onClick: () => undefined }}
        />
      </section>
      <section aria-label="Error state">
        <DataTable
          rows={[]}
          columns={columns}
          rowKey={row => row.id}
          error="The regulated service returned HTTP 500."
          onRetry={() => setRetries(value => value + 1)}
        />
        <output data-testid="retry-count">{retries}</output>
      </section>
      <section aria-label="Read-only state">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={row => row.id}
          readOnly
          owner="Quality Reviewer"
          lockReason="Active edit lease belongs to another reviewer."
        />
      </section>
      <section aria-label="Finalized state">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={row => row.id}
          finalized
          auditReference="AUD-2026-001"
        />
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
