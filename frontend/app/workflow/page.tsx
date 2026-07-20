"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import WorkflowToolbar from "@/components/workflow/WorkflowToolbar";
import WorkflowMetrics from "@/components/workflow/WorkflowMetrics";
import WorkflowTable, {
  type WorkflowPackage,
} from "@/components/workflow/WorkflowTable";
import WorkflowPagination from "@/components/workflow/WorkflowPagination";

const PAGE_SIZE_DEFAULT = 10;

function isWorkflowRunnable(status: string) {
  return status !== "INTAKE_INPUT_CREATED" && !status.includes("RUNNING");
}

function normalize(value: unknown) {
  return String(value || "").toLowerCase();
}

export default function WorkflowPage() {
  const router = useRouter();

  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningPackage, setRunningPackage] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("UPDATED_DESC");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  useEffect(() => {
    void loadPackages();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = window.setInterval(() => {
      void loadPackages();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, pageSize]);

  const metrics = useMemo(() => {
    return {
      total: packages.length,
      completed: packages.filter((item) => item.status === "INTAKE_INPUT_CREATED").length,
      pending: packages.filter((item) => item.status !== "INTAKE_INPUT_CREATED").length,
      running: packages.filter((item) => item.status.includes("RUNNING")).length,
      hits: packages.reduce((sum, item) => sum + Number(item.hits_count || 0), 0),
      screening: packages.reduce(
        (sum, item) => sum + Number(item.screening_count || 0),
        0,
      ),
      output: packages.reduce(
        (sum, item) => sum + Number(item.intake_input_count || 0),
        0,
      ),
    };
  }, [packages]);

  const filteredPackages = useMemo(() => {
    let result = [...packages];
    const query = normalize(searchTerm).trim();

    if (query) {
      result = result.filter((item) =>
        [
          item.package_id,
          item.pmid,
          item.title,
          item.status,
          item.updated_at,
        ].some((value) => normalize(value).includes(query)),
      );
    }

    if (statusFilter !== "ALL") {
      result = result.filter((item) => item.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "UPDATED_ASC") {
        return normalize(a.updated_at).localeCompare(normalize(b.updated_at));
      }

      if (sortBy === "TITLE_ASC") {
        return normalize(a.title).localeCompare(normalize(b.title));
      }

      if (sortBy === "TITLE_DESC") {
        return normalize(b.title).localeCompare(normalize(a.title));
      }

      if (sortBy === "PMID_ASC") {
        return normalize(a.pmid).localeCompare(normalize(b.pmid));
      }

      if (sortBy === "PMID_DESC") {
        return normalize(b.pmid).localeCompare(normalize(a.pmid));
      }

      return normalize(b.updated_at).localeCompare(normalize(a.updated_at));
    });

    return result;
  }, [packages, searchTerm, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredPackages.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPackages = filteredPackages.slice(startIndex, endIndex);
  const startItem = filteredPackages.length === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, filteredPackages.length);

  async function loadPackages() {
    try {
      setLoading(true);

      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Workflow API returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      setPackages(Array.isArray(data) ? data : data.packages || []);
    } catch {
      showToast("Unable to load evidence packages.");
    } finally {
      setLoading(false);
    }
  }

  async function runWorkflow(packageId: string) {
    try {
      setRunningPackage(packageId);

      const response = await fetch("/api/workflow/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: "demo-tenant",
          package_id: packageId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        showToast(data.error || "Workflow execution failed.");
        return;
      }

      showToast(
        `Workflow completed · Hits ${data.hits_count || 0} · Screening ${
          data.screening_count || 0
        } · Downstream outputs ${data.intake_input_count || 0}`,
      );

      await loadPackages();
    } catch {
      showToast("Workflow execution failed.");
    } finally {
      setRunningPackage(null);
    }
  }

  function openPackage(packageId: string) {
    router.push(`/workflow/${encodeURIComponent(packageId)}`);
  }

  function handleRunWorkflow(packageId: string) {
    const selectedPackage = packages.find(
      (item) => item.package_id === packageId,
    );

    if (!selectedPackage) {
      showToast("Evidence package not found.");
      return;
    }

    if (!isWorkflowRunnable(selectedPackage.status)) {
      openPackage(packageId);
      return;
    }

    void runWorkflow(packageId);
  }

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("ALL");
    setSortBy("UPDATED_DESC");
    setCurrentPage(1);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  return (
    <main className="app-shell">
      <InvestorDemoHeader
        title="Literature Workflow Control Center"
        subtitle="Track every evidence package through product-aware Hits, medically governed Screening, human review and a traceable downstream output."
      />

      <Navigation />

      <section className="scope-strip">
        <div>
          <span>Controlled boundary</span>
          <strong>Evidence → Hits → Screening → Downstream Output</strong>
        </div>
        <p>
          Case processing and submission are outside this Literature workspace.
        </p>
      </section>

      <WorkflowToolbar
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        sortBy={sortBy}
        autoRefresh={autoRefresh}
        resultCount={filteredPackages.length}
        totalCount={packages.length}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onSortChange={setSortBy}
        onAutoRefreshChange={setAutoRefresh}
        onRefresh={loadPackages}
        onClearFilters={clearFilters}
      />

      <WorkflowMetrics
        total={metrics.total}
        completed={metrics.completed}
        pending={metrics.pending}
        running={metrics.running}
        hits={metrics.hits}
        screening={metrics.screening}
        output={metrics.output}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="section-kicker">Operational worklist</span>
            <h2>Evidence Packages</h2>
            <p>
              {loading
                ? "Loading evidence packages…"
                : `${filteredPackages.length} result(s) from ${packages.length} governed package(s)`}
            </p>
          </div>

          <button type="button" onClick={() => void loadPackages()}>
            Refresh data
          </button>
        </div>

        <WorkflowTable
          packages={paginatedPackages}
          runningPackage={runningPackage}
          onOpenPackage={openPackage}
          onRunWorkflow={handleRunWorkflow}
        />

        <WorkflowPagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredPackages.length}
          startItem={startItem}
          endItem={endItem}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </section>

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background:
            radial-gradient(circle at 3% 0%, rgba(56, 189, 248, 0.08), transparent 23%),
            #f4f7fb;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
        }

        .scope-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin: 0 0 18px;
          padding: 14px 17px;
          border: 1px solid #bae6fd;
          border-radius: 16px;
          background: #f0f9ff;
        }

        .scope-strip div {
          display: grid;
          gap: 3px;
        }

        .scope-strip span {
          color: #0369a1;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        .scope-strip strong {
          color: #0c4a6e;
          font-size: 13px;
        }

        .scope-strip p {
          margin: 0;
          color: #475569;
          font-size: 11px;
        }

        .panel {
          overflow: hidden;
          border: 1px solid #dbe4ef;
          border-radius: 21px;
          background: #ffffff;
          box-shadow: 0 12px 34px rgba(15, 23, 42, 0.06);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          padding: 23px 24px;
          border-bottom: 1px solid #e2e8f0;
        }

        .section-kicker {
          color: #1d4ed8;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .panel-header h2 {
          margin: 5px 0;
          font-size: 22px;
          letter-spacing: -0.02em;
        }

        .panel-header p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
        }

        .panel-header button {
          border: 0;
          border-radius: 11px;
          padding: 10px 14px;
          color: #ffffff;
          background: #1d4ed8;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 50;
          max-width: 460px;
          padding: 14px 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          color: #ffffff;
          background: #0f172a;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
          font-size: 12px;
          font-weight: 700;
        }

        @media (max-width: 820px) {
          .app-shell {
            padding: 12px;
          }

          .scope-strip,
          .panel-header {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
