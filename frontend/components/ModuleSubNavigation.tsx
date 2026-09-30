"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; path: string; activePrefixes?: string[] };

const NAVIGATION: Record<"LITERATURE" | "INTAKE", Item[]> = {
  LITERATURE: [
    { label: "Dashboard", path: "/literature/dashboard" },
    { label: "Hits", path: "/hits" },
    { label: "Screening", path: "/screening" },
    { label: "Medical Review", path: "/review" },
    { label: "Administration", path: "/literature/admin", activePrefixes: ["/literature/admin", "/admin/literature-calendar", "/admin/literature-scheduler", "/admin/products"] },
  ],
  INTAKE: [
    { label: "Intake", path: "/intake" },
    { label: "Duplicate Check", path: "/intake/duplicate-check", activePrefixes: ["/intake/duplicate-check", "/intake/duplicate-review"] },
    { label: "Triage", path: "/intake/triage" },
    { label: "Medical Review", path: "/intake/medical-review" },
  ],
};

export default function ModuleSubNavigation({ module }: { module: keyof typeof NAVIGATION }) {
  const pathname = usePathname();
  const items = NAVIGATION[module];

  function active(item: Item) {
    const prefixes = item.activePrefixes ?? [item.path];
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  return (
    <nav className="module-subnav" aria-label={`${module} screens`}>
      {items.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          className={active(item) ? "active" : ""}
          aria-current={active(item) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <style jsx>{`
        .module-subnav {
          display: flex;
          min-height: 42px;
          margin: -4px 0 14px;
          overflow-x: auto;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
        }
        .module-subnav :global(a) {
          display: grid;
          min-width: 130px;
          place-items: center;
          padding: 0 14px;
          border-right: 1px solid #e2e8f0;
          color: #475569;
          font-size: 10px;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }
        .module-subnav :global(a:hover) { background: #f8fafc; color: #0f172a; }
        .module-subnav :global(a.active) {
          color: #ffffff;
          background: #185abd;
        }
        @media (max-width: 700px) {
          .module-subnav :global(a) { min-width: 112px; }
        }
      `}</style>
    </nav>
  );
}