"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/" },
  { label: "Workflow", path: "/workflow" },
  { label: "Hits", path: "/hits" },
  { label: "Screening", path: "/screening" },
  { label: "Admin", path: "/admin" },
];

export default function Navigation() {
  const router = useRouter();
  const pathname = usePathname();

  function isActive(path: string) {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  }

  return (
    <nav className="nav-tabs">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${isActive(item.path) ? "active" : ""}`}
          onClick={() => router.push(item.path)}
        >
          {item.label}
        </button>
      ))}

      <style jsx>{`
        .nav-tabs {
          margin: 18px 0;
          display: flex;
          gap: 8px;
          background: #ffffff;
          border: 1px solid #dbe4ef;
          border-radius: 16px;
          padding: 8px;
          overflow-x: auto;
        }

        .nav-item {
          border: none;
          background: transparent;
          padding: 11px 16px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 700;
          color: #334155;
          white-space: nowrap;
        }

        .nav-item.active {
          background: #185a9d;
          color: #ffffff;
        }
      `}</style>
    </nav>
  );
}