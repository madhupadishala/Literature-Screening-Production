"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const modules = [
  { label: "Dashboard", path: "/" },
  { label: "Search", path: "/literature-search" },
  { label: "Workflow", path: "/workflow" },
  { label: "Hits", path: "/hits" },
  { label: "Screening", path: "/screening" },
  { label: "Reports", path: "/reports" },
  { label: "Administration", path: "/admin" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState({
    tenantKey: "Active tenant",
    displayName: "Authenticated user",
    roleKey: "Loading role",
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/context/current", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (active && response.ok && payload.success) setContext(payload.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  function isActive(path: string): boolean {
    return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <div className="shell-header">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="application-bar">
        <Link className="brand" href="/" aria-label="ClinixAI Literature Intelligence dashboard">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-copy">
            <strong>ClinixAI</strong>
            <small>Literature Intelligence</small>
          </span>
        </Link>
        <div className="application-title">
          <span>Safety Operations</span>
          <strong>Literature Review Console</strong>
        </div>
        <div className="identity">
          <div>
            <span>Tenant</span>
            <strong>{context.tenantKey}</strong>
          </div>
          <div>
            <span>User</span>
            <strong>{context.displayName}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{context.roleKey}</strong>
          </div>
          <Link className="health" href="/admin/reliability">
            System Health
          </Link>
        </div>
        <button
          type="button"
          className="menu"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
          <span className="menu-label">Menu</span>
        </button>
      </header>
      <nav
        id="primary-navigation"
        className={open ? "module-bar open" : "module-bar"}
        aria-label="Primary navigation"
      >
        <div className="module-links">
          {modules.map((module) => (
            <Link
              key={module.path}
              href={module.path}
              onClick={() => setOpen(false)}
              className={isActive(module.path) ? "active" : ""}
              aria-current={isActive(module.path) ? "page" : undefined}
            >
              {module.label}
            </Link>
          ))}
        </div>
        <div className="boundary">
          <span>Validated boundary</span>
          <strong>Search → Hits → Screening → Output</strong>
        </div>
      </nav>
      <div className="validation">
        <span aria-hidden="true" />
        Demonstration environment · Synthetic data only · Tenant and RBAC controls active
      </div>
      <style jsx>{`
        .shell-header {
          position: sticky;
          top: 0;
          z-index: 60;
          margin: -24px -24px 18px;
          font-family: "Poppins", Arial, sans-serif;
          box-shadow: 0 5px 18px rgba(15, 23, 42, 0.18);
        }
        .skip-link {
          position: fixed;
          top: 8px;
          left: 8px;
          z-index: 200;
          transform: translateY(-150%);
          padding: 9px 12px;
          border-radius: 5px;
          color: #fff;
          background: #1d4ed8;
          font-size: 11px;
          font-weight: 800;
        }
        .skip-link:focus {
          transform: translateY(0);
        }
        .application-bar {
          display: flex;
          min-height: 60px;
          align-items: stretch;
          color: #fff;
          background: #0f172a;
        }
        .brand {
          display: flex;
          min-width: 244px;
          align-items: center;
          gap: 10px;
          padding: 8px 18px;
          color: #fff;
          text-decoration: none;
        }
        .brand:hover {
          background: rgba(255, 255, 255, 0.05);
        }
        .brand-mark {
          display: grid;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 7px;
          background: linear-gradient(135deg, #1d4ed8, #38bdf8);
          font-size: 21px;
          font-weight: 900;
        }
        .brand-copy {
          display: grid;
        }
        .brand-copy strong {
          font-size: 15px;
        }
        .brand-copy small {
          color: #94a3b8;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .application-title {
          display: grid;
          min-width: 235px;
          align-content: center;
          padding: 8px 18px;
          border-inline: 1px solid rgba(255, 255, 255, 0.08);
        }
        .application-title span,
        .identity span {
          color: #7dd3fc;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .application-title strong {
          margin-top: 2px;
          font-size: 12px;
        }
        .identity {
          display: flex;
          flex: 1;
          justify-content: flex-end;
          align-items: stretch;
          overflow: hidden;
        }
        .identity > div {
          display: grid;
          min-width: 120px;
          max-width: 190px;
          align-content: center;
          padding: 7px 12px;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
        }
        .identity strong {
          margin-top: 2px;
          overflow: hidden;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .health {
          display: grid;
          place-items: center;
          padding: 0 15px;
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          color: #bae6fd;
          font-size: 9px;
          font-weight: 900;
          text-decoration: none;
          white-space: nowrap;
        }
        .health:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .menu {
          display: none;
          border: 0;
          padding: 0 16px;
          color: #fff;
          background: transparent;
          font: inherit;
          cursor: pointer;
        }
        .menu span:first-child {
          font-size: 21px;
        }
        .menu-label {
          font-size: 9px;
          font-weight: 800;
        }
        .module-bar {
          display: flex;
          min-height: 44px;
          justify-content: space-between;
          color: #fff;
          background: #185abd;
        }
        .module-links {
          display: flex;
          overflow-x: auto;
        }
        .module-links :global(a) {
          display: grid;
          min-width: 100px;
          place-items: center;
          padding: 0 15px;
          border-right: 1px solid rgba(255, 255, 255, 0.13);
          color: #dbeafe;
          font-size: 9px;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }
        .module-links :global(a:hover) {
          color: #fff;
          background: rgba(15, 23, 42, 0.12);
        }
        .module-links :global(a.active) {
          color: #0f172a;
          background: #fff;
        }
        .boundary {
          display: grid;
          min-width: 224px;
          align-content: center;
          padding: 5px 15px;
          border-left: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(15, 23, 42, 0.14);
        }
        .boundary span {
          color: #bfdbfe;
          font-size: 7px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .boundary strong {
          margin-top: 2px;
          font-size: 8px;
        }
        .validation {
          display: flex;
          min-height: 26px;
          align-items: center;
          gap: 7px;
          padding: 0 18px;
          border-bottom: 1px solid #bbf7d0;
          color: #166534;
          background: #f0fdf4;
          font-size: 8px;
          font-weight: 800;
        }
        .validation span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22c55e;
        }
        @media (max-width: 1100px) {
          .application-title,
          .boundary,
          .identity > div:first-child {
            display: none;
          }
        }
        @media (max-width: 760px) {
          .shell-header {
            margin: -12px -12px 14px;
          }
          .brand {
            min-width: 0;
            flex: 1;
          }
          .identity {
            display: none;
          }
          .menu {
            display: grid;
            place-items: center;
          }
          .module-bar {
            display: none;
          }
          .module-bar.open {
            display: block;
          }
          .module-links {
            display: grid;
            grid-template-columns: 1fr 1fr;
            padding: 6px;
          }
          .module-links :global(a) {
            min-height: 42px;
            border: 0;
            border-radius: 4px;
          }
        }
      `}</style>
    </div>
  );
}
