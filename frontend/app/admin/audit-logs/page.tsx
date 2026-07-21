"use client";

import { useCallback, useEffect, useState } from "react";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import AuditResultTable from "@/components/audit/AuditResultTable";
import AuditSearchPanel from "@/components/audit/AuditSearchPanel";
import type { AuditRecord, AuditSearchFilters } from "@/lib/audit/audit-types";

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditSearchFilters>({ severity: "ALL" });
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (activeFilters: AuditSearchFilters, activePage: number) => {
    setLoading(true);
    setError("");
    try {
      const parameters = toParameters(activeFilters);
      parameters.set("page", String(activePage));
      parameters.set("pageSize", String(PAGE_SIZE));
      const response = await fetch(`/api/audit/search?${parameters}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success)
        throw new Error(payload?.error || "Audit search failed.");
      setRecords(payload.data.records);
      setTotal(payload.data.total);
    } catch (caught) {
      setRecords([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : "Audit search failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void load(filters, page), 0);
    return () => window.clearTimeout(request);
  }, [filters, load, page]);

  function search(next: AuditSearchFilters) {
    setPage(1);
    setFilters(next);
  }

  function exportCsv() {
    const parameters = toParameters(filters);
    parameters.set("format", "csv");
    window.location.assign(`/api/audit/search?${parameters}`);
  }

  return (
    <main className="app-shell">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="ENTERPRISE RELIABILITY"
        title="Immutable Audit Trail"
        subtitle="Search tenant-isolated workflow, security, AI, configuration, and evidence events from the append-only production ledger."
        status="Audit Controlled"
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="workspace">
        <AuditSearchPanel initialFilters={filters} loading={loading} onSearch={search} />
        <AuditResultTable
          records={records}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          onExport={exportCsv}
          onPageChange={setPage}
        />
      </div>
      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, sans-serif;
        }
        .workspace {
          display: grid;
          gap: 16px;
        }
        .error {
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          color: #991b1b;
          background: #fef2f2;
          font-size: 12px;
          font-weight: 700;
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

function toParameters(filters: AuditSearchFilters): URLSearchParams {
  const parameters = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "ALL") parameters.set(key, String(value));
  });
  return parameters;
}
