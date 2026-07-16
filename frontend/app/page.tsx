"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import Navigation from "@/components/Navigation";
import WorkflowDashboard from "@/components/workflow/WorkflowDashboard";
import type { WorkflowPackage } from "@/components/workflow/WorkflowTable";

export default function HomePage() {
  const router = useRouter();

  const [packages, setPackages] = useState<WorkflowPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);

      const response = await fetch("/api/workflow/list", {
        cache: "no-store",
      });

      const data = await response.json();
      setPackages(Array.isArray(data) ? data : data.packages || []);
    } catch {
      showToast("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  function openPackage(packageId: string) {
    router.push(`/workflow/${encodeURIComponent(packageId)}`);
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">ClinixAI</div>
          <div className="subtitle">Literature Screening V1</div>
        </div>

        <div className="topbar-meta">
          <span>Project: Demo</span>
          <span>User: Madhu</span>
          <span className="prod-badge">PROD</span>
        </div>
      </header>

      <Navigation />

      <div className="page-actions">
        <button onClick={loadPackages}>Refresh Dashboard</button>
        <button onClick={() => router.push("/workflow")}>Open Workflow Manager</button>
      </div>

      <WorkflowDashboard
        packages={packages}
        loading={loading}
        onOpenPackage={openPackage}
      />

      {toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .app-shell {
          min-height: 100vh;
          background: #f4f7fb;
          padding: 24px;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
        }

        .topbar {
          background: linear-gradient(135deg, #071b34, #123f68);
          color: #ffffff;
          border-radius: 20px;
          padding: 24px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18);
        }

        .brand {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: -0.5px;
        }

        .subtitle {
          margin-top: 6px;
          color: #cfe7ff;
          font-size: 14px;
        }

        .topbar-meta {
          display: flex;
          gap: 12px;
          align-items: center;
          font-size: 13px;
        }

        .topbar-meta span {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 10px;
          border-radius: 999px;
        }

        .prod-badge {
          font-weight: 900;
        }

        .page-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 18px;
        }

        .page-actions button {
          border: none;
          border-radius: 12px;
          background: #185a9d;
          color: #ffffff;
          padding: 11px 16px;
          cursor: pointer;
          font-weight: 800;
        }

        .page-actions button:first-child {
          background: #ffffff;
          color: #185a9d;
          border: 1px solid #dbe4ef;
        }

        .toast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          background: #0f172a;
          color: #ffffff;
          padding: 14px 18px;
          border-radius: 14px;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28);
          font-weight: 700;
          z-index: 50;
        }

        @media (max-width: 900px) {
          .topbar {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .topbar-meta {
            flex-wrap: wrap;
          }

          .page-actions {
            justify-content: flex-start;
            flex-wrap: wrap;
          }
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