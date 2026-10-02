"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ModuleKey =
  | "LITERATURE"
  | "INTAKE"
  | "CASE_PROCESSING"
  | "SUBMISSIONS";

const modules: Array<{
  label: string;
  path: string;
  moduleKey?: ModuleKey;
  activePrefixes?: string[];
}> = [
  { label: "Dashboard", path: "/" },
  {
    label: "Literature Screening",
    path: "/literature/dashboard",
    moduleKey: "LITERATURE",
    activePrefixes: ["/literature-search", "/workflow", "/hits", "/screening", "/review", "/reports"],
  },
  { label: "Intake", path: "/intake", moduleKey: "INTAKE" },
  { label: "Case Processing", path: "/cases", moduleKey: "CASE_PROCESSING" },
  { label: "Submissions", path: "/submissions", moduleKey: "SUBMISSIONS" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<{
    tenantKey: string;
    environment: string;
    displayName: string;
    roleKey: string;
    enabledModules: string[];
  }>({
    tenantKey: "Active tenant",
    environment: "—",
    displayName: "Authenticated user",
    roleKey: "Loading role",
    enabledModules: [],
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

  function isActive(module: (typeof modules)[number]): boolean {
    if (module.path === "/") return pathname === "/";
    const prefixes = module.activePrefixes ?? [module.path];
    return prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  const visibleModules = modules.filter(
    (module) => !module.moduleKey || context.enabledModules.includes(module.moduleKey),
  );

  const isCaseWorkspace =
    Boolean(pathname) &&
    pathname !== "/cases" &&
    pathname.startsWith("/cases/");

  function dispatchUtilityAction(action: string) {
    window.dispatchEvent(new CustomEvent(`nexus:${action}`));
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    routerFallback();
  }

  function routerFallback() {
    router.push("/");
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
            <small>Nexus Safety Platform</small>
          </span>
        </Link>
        <div className="application-title">
          <span>Safety Operations</span>
          <strong>Nexus Workspace</strong>
        </div>

        <div className="utility-toolbar" aria-label="Global actions">
          <button
            type="button"
            className="utility-action"
            onClick={goBack}
            disabled={pathname === "/"}
            title="Go back"
          >
            ← <span>Back</span>
          </button>

          <button
            type="button"
            className="utility-action"
            onClick={() => dispatchUtilityAction("save")}
            disabled={!isCaseWorkspace}
            title={isCaseWorkspace ? "Save current case" : "Save is available inside an editable workspace"}
          >
            Save
          </button>

          <button
            type="button"
            className="utility-action"
            onClick={() => window.print()}
            title="Print current screen"
          >
            Print
          </button>

          <details className="generate-menu">
            <summary className={isCaseWorkspace ? "" : "disabled"}>Generate</summary>
            <div className="generate-popover">
              <button
                type="button"
                disabled={!isCaseWorkspace}
                onClick={() => dispatchUtilityAction("generate-evidence")}
              >
                Evidence Package
              </button>
              <button
                type="button"
                disabled={!isCaseWorkspace}
                onClick={() => dispatchUtilityAction("generate-e2b")}
              >
                E2B(R3) Export
              </button>
              <button
                type="button"
                disabled
                title="CIOMS I generator will be enabled after the regulated CIOMS reporting function is implemented."
              >
                CIOMS I
              </button>
            </div>
          </details>
        </div>

        <div className="identity">
          <div>
            <span>Tenant</span>
            <strong>{context.tenantKey}</strong>
          </div>
          <div>
            <span>Environment</span>
            <strong>{context.environment}</strong>
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
          {visibleModules.map((module) => (
            <Link
              key={module.path}
              href={module.path}
              onClick={() => setOpen(false)}
              className={isActive(module) ? "active" : ""}
              aria-current={isActive(module) ? "page" : undefined}
            >
              {module.label}
            </Link>
          ))}
        </div>

      </nav>
      <div className="validation">
        <span aria-hidden="true" />
        Controlled environment · Tenant, module entitlement and RBAC controls active
      </div>
      <style jsx>{`
        .shell-header {
          position: sticky;
          top: 0;
          z-index: 60;
          margin: -24px -24px 18px;
          font-family: var(--nx-font-sans);
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
          color: var(--nx-color-text-inverse);
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
          color: var(--nx-color-text-inverse);
          background: var(--nx-color-text);
        }
        .brand {
          display: flex;
          min-width: 244px;
          align-items: center;
          gap: 10px;
          padding: 8px 18px;
          color: var(--nx-color-text-inverse);
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
          background: var(--nx-color-interactive);
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
        .utility-toolbar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 7px 10px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }
        .utility-action,
        .generate-menu summary,
        .generate-popover button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 5px;
          color: #e2e8f0;
          background: rgba(255, 255, 255, 0.05);
          font: inherit;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }
        .utility-action {
          min-height: 34px;
          padding: 0 10px;
        }
        .utility-action:hover:not(:disabled),
        .generate-menu summary:hover,
        .generate-popover button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
        }
        .utility-action:disabled,
        .generate-popover button:disabled,
        .generate-menu summary.disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
        .generate-menu {
          position: relative;
        }
        .generate-menu summary {
          display: grid;
          min-height: 34px;
          place-items: center;
          padding: 0 10px;
          list-style: none;
        }
        .generate-menu summary::-webkit-details-marker {
          display: none;
        }
        .generate-popover {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 120;
          display: grid;
          min-width: 170px;
          gap: 4px;
          padding: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: var(--nx-color-surface);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
        }
        .generate-popover button {
          min-height: 34px;
          padding: 0 10px;
          color: #0f172a;
          background: #f8fafc;
          text-align: left;
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
          color: var(--nx-color-text-inverse);
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
          color: var(--nx-color-text-inverse);
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
          color: var(--nx-color-text-inverse);
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
        @media (max-width: 900px) {
          .utility-toolbar {
            flex: 1;
            justify-content: flex-end;
          }
          .utility-action span {
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
          .utility-toolbar {
            padding-inline: 6px;
          }
          .utility-action,
          .generate-menu summary {
            padding-inline: 8px;
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
