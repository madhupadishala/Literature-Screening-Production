"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const modules = [
  { label: "Dashboard", path: "/" },
  { label: "Ad Hoc Search", path: "/literature-search" },
  { label: "Workflow", path: "/workflow" },
  { label: "Hits", path: "/hits" },
  { label: "Screening", path: "/screening" },
  { label: "Reports", path: "/reports" },
  { label: "Administration", path: "/admin" },
];

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();
  const [context, setContext] = useState({
    tenantKey: "Active Tenant",
    displayName: "Authenticated User",
    roleKey: "RBAC",
  });

  useEffect(() => {
    let active = true;

    void fetch("/api/context/current", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (active && response.ok && payload.success) {
          setContext(payload.data);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <div className="enterprise-shell-header">
      <header className="application-ribbon">
        <button
          type="button"
          className="brand"
          onClick={() => router.push("/")}
          aria-label="Open ClinixAI dashboard"
        >
          <span className="brand-mark">C</span>
          <span className="brand-copy">
            <strong>ClinixAI</strong>
            <small>Literature Intelligence</small>
          </span>
        </button>

        <div className="application-title">
          <span>Safety Operations</span>
          <strong>Literature Review Console</strong>
        </div>

        <div className="application-controls">
          <button
            type="button"
            className="context-control"
            onClick={() => router.push("/tenant-management")}
          >
            <span>Tenant</span>
            <strong>{context.tenantKey}</strong>
          </button>

          <button
            type="button"
            className="context-control"
            onClick={() => router.push("/admin/users-roles")}
          >
            <span>User</span>
            <strong>{context.displayName}</strong>
          </button>

          <span className="environment-badge" title={context.roleKey}>
            {(process.env.NEXT_PUBLIC_APP_ENVIRONMENT || "DEMO").toUpperCase()}
          </span>

          <button
            type="button"
            className="icon-action"
            onClick={() => window.location.reload()}
            title="Refresh current page"
            aria-label="Refresh current page"
          >
            ↻
          </button>

          <button
            type="button"
            className="health-action"
            onClick={() => router.push("/admin/reliability")}
          >
            System Health
          </button>
        </div>
      </header>

      <nav className="module-ribbon" aria-label="ClinixAI modules">
        <div className="module-tabs">
          {modules.map((module) => (
            <button
              key={module.path}
              type="button"
              className={isActive(module.path) ? "active" : ""}
              aria-current={isActive(module.path) ? "page" : undefined}
              onClick={() => router.push(module.path)}
            >
              {module.label}
            </button>
          ))}
        </div>

        <div className="boundary-control">
          <span>Literature boundary</span>
          <strong>Search → Hits → Screening → Output</strong>
        </div>
      </nav>

      <div className="validation-ribbon">
        <span className="validation-dot" />
        Validated demonstration dataset · No real patient data
      </div>

      <style jsx>{`
        .enterprise-shell-header {
          position: sticky;
          top: 0;
          z-index: 60;
          margin: -24px -24px 18px;
          font-family: "Poppins", Arial, Helvetica, sans-serif;
          box-shadow: 0 5px 18px rgba(15, 23, 42, 0.18);
        }

        .application-ribbon {
          display: flex;
          min-height: 58px;
          align-items: stretch;
          color: #ffffff;
          background: #0f172a;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        button {
          font: inherit;
        }

        .brand {
          display: flex;
          min-width: 250px;
          align-items: center;
          gap: 10px;
          padding: 8px 18px;
          border: 0;
          color: #ffffff;
          background: transparent;
          cursor: pointer;
          text-align: left;
        }

        .brand:hover {
          background: rgba(255, 255, 255, 0.045);
        }

        .brand-mark {
          display: grid;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 7px;
          color: #ffffff;
          background: linear-gradient(135deg, #1d4ed8, #38bdf8);
          font-size: 21px;
          font-weight: 900;
        }

        .brand-copy {
          display: grid;
          gap: 1px;
        }

        .brand-copy strong {
          font-size: 15px;
        }

        .brand-copy small {
          color: #94a3b8;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.055em;
          text-transform: uppercase;
        }

        .application-title {
          display: grid;
          min-width: 240px;
          align-content: center;
          padding: 8px 18px;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }

        .application-title span {
          color: #7dd3fc;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .application-title strong {
          margin-top: 2px;
          font-size: 13px;
        }

        .application-controls {
          display: flex;
          flex: 1;
          justify-content: flex-end;
          align-items: stretch;
          overflow-x: auto;
        }

        .context-control,
        .icon-action,
        .health-action {
          border: 0;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          color: #ffffff;
          background: transparent;
          cursor: pointer;
        }

        .context-control {
          display: grid;
          min-width: 145px;
          align-content: center;
          padding: 7px 14px;
          text-align: left;
        }

        .context-control span {
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .context-control strong {
          margin-top: 2px;
          font-size: 10px;
          white-space: nowrap;
        }

        .environment-badge {
          align-self: center;
          margin: 0 12px;
          padding: 6px 9px;
          border: 1px solid #22d3ee;
          border-radius: 4px;
          color: #cffafe;
          background: rgba(8, 145, 178, 0.18);
          font-size: 9px;
          font-weight: 900;
        }

        .icon-action {
          width: 48px;
          font-size: 20px;
        }

        .health-action {
          padding: 0 16px;
          color: #bae6fd;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
        }

        .context-control:hover,
        .icon-action:hover,
        .health-action:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .module-ribbon {
          display: flex;
          min-height: 43px;
          align-items: stretch;
          justify-content: space-between;
          color: #ffffff;
          background: #185abd;
        }

        .module-tabs {
          display: flex;
          overflow-x: auto;
        }

        .module-tabs button {
          min-width: 104px;
          padding: 0 18px;
          border: 0;
          border-right: 1px solid rgba(255, 255, 255, 0.13);
          color: #dbeafe;
          background: transparent;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .module-tabs button:hover {
          color: #ffffff;
          background: rgba(15, 23, 42, 0.12);
        }

        .module-tabs button.active {
          color: #0f172a;
          background: #ffffff;
        }

        .boundary-control {
          display: grid;
          min-width: 225px;
          align-content: center;
          padding: 5px 16px;
          border-left: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(15, 23, 42, 0.14);
        }

        .boundary-control span {
          color: #bfdbfe;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .boundary-control strong {
          margin-top: 2px;
          font-size: 9px;
        }

        .validation-ribbon {
          display: flex;
          min-height: 25px;
          align-items: center;
          gap: 7px;
          padding: 0 18px;
          border-bottom: 1px solid #bbf7d0;
          color: #166534;
          background: #f0fdf4;
          font-size: 8px;
          font-weight: 800;
        }

        .validation-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
        }

        @media (max-width: 1050px) {
          .application-title,
          .boundary-control {
            display: none;
          }
        }

        @media (max-width: 700px) {
          .enterprise-shell-header {
            margin: -12px -12px 14px;
          }

          .brand {
            min-width: 190px;
          }

          .context-control {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
