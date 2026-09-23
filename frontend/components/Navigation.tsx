"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type ModuleKey =
  | "LITERATURE"
  | "INTAKE"
  | "CASE_PROCESSING"
  | "MEDICAL_REVIEW"
  | "SIGNAL_MANAGEMENT"
  | "AGGREGATE_REPORTING"
  | "GOVERNANCE";

type PrimaryItem = {
  label: string;
  path?: string;
  moduleKey?: ModuleKey;
  activePrefixes?: string[];
  disabled?: boolean;
  disabledReason?: string;
};

type SecondaryItem = {
  label: string;
  path: string;
  exact?: boolean;
};

const primaryItems: PrimaryItem[] = [
  { label: "Home", path: "/", activePrefixes: ["/"] },
  {
    label: "Intake & Triage",
    path: "/intake",
    moduleKey: "INTAKE",
    activePrefixes: ["/intake"],
  },
  {
    label: "Case Processing",
    path: "/cases",
    moduleKey: "CASE_PROCESSING",
    activePrefixes: ["/cases"],
  },
  {
    label: "Submissions",
    disabled: true,
    disabledReason: "Regulatory transmission is not enabled in this release candidate.",
  },
  {
    label: "Literature",
    path: "/literature-search",
    moduleKey: "LITERATURE",
    activePrefixes: ["/literature-search", "/workflow", "/hits", "/screening", "/review"],
  },
  { label: "Reports", path: "/reports", activePrefixes: ["/reports"] },
  { label: "Administration", path: "/admin", activePrefixes: ["/admin"] },
];

const intakeSecondary: SecondaryItem[] = [
  { label: "Booking Queue", path: "/intake", exact: true },
  { label: "Duplicate Check", path: "/intake/duplicate-check" },
  { label: "Triage Queue", path: "/intake/triage-queue" },
  { label: "QC Queue", path: "/intake/qc-queue" },
  { label: "MR Queue", path: "/intake/mr-queue" },
];

const caseSecondary: SecondaryItem[] = [
  { label: "My Cases", path: "/cases", exact: true },
  { label: "Duplicate Check", path: "/cases/duplicate-check" },
  { label: "Processing Queue", path: "/cases/processing" },
  { label: "QC Queue", path: "/cases/qc-queue" },
  { label: "MR Queue", path: "/cases/mr-queue" },
  { label: "Finalized", path: "/cases/finalized" },
];

const literatureSecondary: SecondaryItem[] = [
  { label: "Search", path: "/literature-search" },
  { label: "Workflow", path: "/workflow" },
  { label: "Hits", path: "/hits" },
  { label: "Screening", path: "/screening" },
  { label: "Review Queue", path: "/review" },
];

export default function Navigation() {
  const pathname = usePathname();
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

  function primaryActive(item: PrimaryItem): boolean {
    if (!item.path) return false;
    if (item.path === "/") return pathname === "/";
    return (item.activePrefixes ?? [item.path]).some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  function secondaryActive(item: SecondaryItem): boolean {
    if (item.exact) return pathname === item.path;
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  }

  const visiblePrimary = primaryItems.filter(
    (item) => !item.moduleKey || context.enabledModules.includes(item.moduleKey),
  );

  let secondaryItems: SecondaryItem[] = [];
  if (pathname.startsWith("/intake")) secondaryItems = intakeSecondary;
  else if (pathname.startsWith("/cases")) secondaryItems = caseSecondary;
  else if (
    ["/literature-search", "/workflow", "/hits", "/screening", "/review"].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    secondaryItems = literatureSecondary;
  }

  const moduleSummary = context.enabledModules
    .filter((module) => ["LITERATURE", "INTAKE", "CASE_PROCESSING"].includes(module))
    .map((module) => module.replaceAll("_", " "))
    .join(" · ");

  return (
    <div className="nexus-shell-header">
      <a className="nexus-skip" href="#main-content">
        Skip to main content
      </a>

      <header className="nexus-command-bar">
        <Link className="nexus-brand" href="/" aria-label="TheClinixAI Nexus home">
          <span className="nexus-mark" aria-hidden="true">N</span>
          <span className="nexus-brand-copy">
            <strong>TheClinixAI</strong>
            <small>Nexus Safety Platform</small>
          </span>
        </Link>

        <div className="nexus-product">
          <strong>Nexus</strong>
          <span>Pharmacovigilance Operations Platform</span>
        </div>

        <div className="nexus-spacer" />

        <div className="nexus-context" title={`Licensed: ${moduleSummary || "Core"}`}>
          <span className={context.environment === "PROD" ? "nexus-env prod" : "nexus-env"}>
            {context.environment}
          </span>
          <div className="nexus-tenant">
            <span>Tenant</span>
            <strong>{context.tenantKey}</strong>
          </div>
          <div className="nexus-user">
            <span>User</span>
            <strong>{context.displayName}</strong>
            <small>{context.roleKey.replaceAll("_", " ")}</small>
          </div>
        </div>
      </header>

      <nav className="nexus-primary" aria-label="Nexus primary navigation">
        <div className="nexus-primary-scroll">
          {visiblePrimary.map((item) =>
            item.disabled ? (
              <span
                key={item.label}
                className="nexus-primary-link disabled"
                title={item.disabledReason}
                aria-disabled="true"
              >
                {item.label}
                <small>Planned</small>
              </span>
            ) : (
              <Link
                key={item.label}
                href={item.path ?? "/"}
                className={primaryActive(item) ? "nexus-primary-link active" : "nexus-primary-link"}
                aria-current={primaryActive(item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ),
          )}
        </div>
        <Link className="nexus-health" href="/admin/reliability">
          System Health
        </Link>
      </nav>

      {secondaryItems.length ? (
        <nav className="nexus-secondary" aria-label="Operational queues">
          <div className="nexus-secondary-scroll">
            {secondaryItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={secondaryActive(item) ? "active" : ""}
                aria-current={secondaryActive(item) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <span className="nexus-control-state">
            Controlled environment · RBAC + entitlement active
          </span>
        </nav>
      ) : null}

      <style jsx>{`
        .nexus-shell-header {
          position: sticky;
          top: 0;
          z-index: 80;
          margin: -18px -18px 16px;
          border-bottom: 1px solid #d8e0ea;
          background: #ffffff;
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .nexus-skip {
          position: fixed;
          top: 6px;
          left: 6px;
          z-index: 200;
          transform: translateY(-150%);
          padding: 8px 10px;
          background: #0f5fa8;
          color: #fff;
          text-decoration: none;
          border-radius: 4px;
        }
        .nexus-skip:focus { transform: translateY(0); }
        .nexus-command-bar {
          min-height: 58px;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 0 22px;
          border-bottom: 1px solid #e8edf3;
          background: #fff;
        }
        .nexus-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 178px;
          color: #102a43;
          text-decoration: none;
        }
        .nexus-mark {
          display: grid;
          width: 31px;
          height: 31px;
          place-items: center;
          border-radius: 7px;
          color: #fff;
          background: linear-gradient(135deg, #0f6db7, #16a394);
          font-size: 16px;
          font-weight: 900;
        }
        .nexus-brand-copy { display: grid; line-height: 1.05; }
        .nexus-brand-copy strong { font-size: 14px; letter-spacing: -0.02em; }
        .nexus-brand-copy small { margin-top: 3px; color: #718096; font-size: 8px; font-weight: 700; }
        .nexus-product {
          display: grid;
          padding-left: 16px;
          border-left: 1px solid #dce4ed;
          line-height: 1.08;
        }
        .nexus-product strong { color: #0f5fa8; font-size: 15px; }
        .nexus-product span { margin-top: 3px; color: #718096; font-size: 9px; }
        .nexus-spacer { flex: 1; }
        .nexus-context { display: flex; align-items: center; gap: 16px; min-width: 0; }
        .nexus-env {
          display: inline-flex;
          align-items: center;
          height: 27px;
          padding: 0 9px;
          border-radius: 5px;
          color: #1e40af;
          background: #dbeafe;
          font-size: 9px;
          font-weight: 900;
        }
        .nexus-env.prod { color: #065f46; background: #d1fae5; }
        .nexus-tenant, .nexus-user { display: grid; min-width: 0; }
        .nexus-tenant span, .nexus-user span { color: #718096; font-size: 8px; text-transform: uppercase; font-weight: 800; letter-spacing: .04em; }
        .nexus-tenant strong, .nexus-user strong { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #172b4d; font-size: 10px; }
        .nexus-user small { color: #718096; font-size: 8px; }
        .nexus-primary {
          display: flex;
          min-height: 43px;
          align-items: stretch;
          justify-content: space-between;
          padding: 0 18px;
          background: #fff;
        }
        .nexus-primary-scroll, .nexus-secondary-scroll { display: flex; align-items: stretch; overflow-x: auto; scrollbar-width: none; }
        .nexus-primary-scroll::-webkit-scrollbar, .nexus-secondary-scroll::-webkit-scrollbar { display: none; }
        .nexus-primary-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 0 15px;
          color: #42526e;
          text-decoration: none;
          white-space: nowrap;
          font-size: 10px;
          font-weight: 700;
          border-bottom: 3px solid transparent;
        }
        .nexus-primary-link:hover { color: #0f5fa8; background: #f7fafc; }
        .nexus-primary-link.active { color: #0f5fa8; border-bottom-color: #0f6db7; background: #f5faff; }
        .nexus-primary-link.disabled { cursor: not-allowed; color: #a0aec0; }
        .nexus-primary-link.disabled small { font-size: 7px; font-weight: 800; color: #b7791f; text-transform: uppercase; }
        .nexus-health {
          display: inline-flex;
          align-items: center;
          padding: 0 8px 0 16px;
          color: #0f5fa8;
          text-decoration: none;
          white-space: nowrap;
          font-size: 9px;
          font-weight: 800;
        }
        .nexus-secondary {
          display: flex;
          min-height: 38px;
          align-items: stretch;
          justify-content: space-between;
          padding: 0 18px;
          border-top: 1px solid #edf1f5;
          background: #f8fafc;
        }
        .nexus-secondary a {
          display: inline-flex;
          align-items: center;
          padding: 0 14px;
          border-bottom: 2px solid transparent;
          color: #526579;
          text-decoration: none;
          white-space: nowrap;
          font-size: 9px;
          font-weight: 700;
        }
        .nexus-secondary a:hover { color: #0f5fa8; background: #fff; }
        .nexus-secondary a.active { color: #0f5fa8; border-bottom-color: #0f6db7; background: #fff; }
        .nexus-control-state {
          display: inline-flex;
          align-items: center;
          padding-left: 14px;
          color: #718096;
          white-space: nowrap;
          font-size: 8px;
        }
        @media (max-width: 980px) {
          .nexus-command-bar { padding: 0 14px; gap: 10px; }
          .nexus-product { display: none; }
          .nexus-tenant { display: none; }
          .nexus-primary, .nexus-secondary { padding: 0 8px; }
          .nexus-control-state, .nexus-health { display: none; }
        }
        @media (max-width: 620px) {
          .nexus-brand-copy small, .nexus-user span, .nexus-user small { display: none; }
          .nexus-brand { min-width: auto; }
          .nexus-user strong { max-width: 100px; }
          .nexus-primary-link { padding-inline: 11px; }
          .nexus-secondary a { padding-inline: 11px; }
        }
      `}</style>
    </div>
  );
}
