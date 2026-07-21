"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import InvestorDemoHeader from "@/components/InvestorDemoHeader";
import Navigation from "@/components/Navigation";
import WorkflowDashboard from "@/components/workflow/WorkflowDashboard";
import type { WorkflowPackage } from "@/components/workflow/WorkflowTable";

export default function HomePage() {
  const router = useRouter();
  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadPackages = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/workflow/list", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Dashboard data could not be loaded.");
      setPackages(Array.isArray(data) ? data : data.packages || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dashboard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => void loadPackages(), 0);
    return () => window.clearTimeout(request);
  }, [loadPackages]);

  const workflowSummary = useMemo(() => {
    const values = packages.map((item) => String(item.status || "UNKNOWN"));
    return {
      total: packages.length,
      active: values.filter((value) => !/COMPLETE|CREATED|EXCLUDED/.test(value)).length,
      completed: values.filter((value) => /COMPLETE|CREATED/.test(value)).length,
    };
  }, [packages]);

  return (
    <main className="app-shell" id="main-content">
      <Navigation />
      <InvestorDemoHeader
        eyebrow="LITERATURE OPERATIONS"
        title="Literature Screening Command Center"
        subtitle="A single governed view of enterprise search, evidence packages, AI-assisted Hits and Screening, human decisions, and traceable downstream outputs."
        status="Operational"
      />

      <section className="quick-actions" aria-label="Primary actions">
        <div>
          <span>Current workspace</span>
          <strong>
            {workflowSummary.total} packages · {workflowSummary.active} active ·{" "}
            {workflowSummary.completed} completed
          </strong>
        </div>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={() => void loadPackages()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={() => router.push("/literature-search")}>
            Start Literature Search
          </button>
          <button type="button" onClick={() => router.push("/workflow")}>
            Open Workflow Manager
          </button>
        </div>
      </section>

      {message && (
        <div className="error" role="alert">
          <strong>Dashboard unavailable</strong>
          <span>{message}</span>
          <button type="button" onClick={() => void loadPackages()}>
            Retry
          </button>
        </div>
      )}

      <WorkflowDashboard
        packages={packages}
        loading={loading}
        onOpenPackage={(packageId) => router.push(`/workflow/${encodeURIComponent(packageId)}`)}
      />

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          padding: 24px;
          color: #0f172a;
          background: #eef2f7;
          font-family: "Poppins", Arial, sans-serif;
        }
        .quick-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 14px;
          padding: 14px 16px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fff;
          box-shadow: 0 3px 10px rgba(15, 23, 42, 0.05);
        }
        .quick-actions span {
          display: block;
          color: #64748b;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .quick-actions strong {
          display: block;
          margin-top: 4px;
          font-size: 11px;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }
        button {
          min-height: 38px;
          border: 0;
          border-radius: 6px;
          padding: 9px 12px;
          color: #fff;
          background: #185abd;
          font: inherit;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }
        button.secondary {
          border: 1px solid #cbd5e1;
          color: #334155;
          background: #fff;
        }
        button:disabled {
          opacity: 0.55;
        }
        .error {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #991b1b;
          background: #fef2f2;
          font-size: 10px;
        }
        .error span {
          flex: 1;
        }
        .error button {
          background: #991b1b;
        }
        @media (max-width: 800px) {
          .quick-actions {
            align-items: flex-start;
            flex-direction: column;
          }
          .actions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 700px) {
          .app-shell {
            padding: 12px;
          }
          .actions button {
            flex: 1 1 140px;
          }
        }
      `}</style>
    </main>
  );
}
