"use client";

import Link from "next/link";
import styles from "./Navigation.module.css";
import { UI_MODULE_REGISTRY } from "@/lib/nexus/ui-module-registry";
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { useWorkspaceContext } from "@/components/context/WorkspaceContext";
import { getSession, saveSession } from "@/lib/session-manager";

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
    activePrefixes: [...UI_MODULE_REGISTRY.LITERATURE.activePrefixes],
  },
  { label: "Intake", path: "/intake", moduleKey: "INTAKE" },
  { label: "Case Processing", path: "/cases", moduleKey: "CASE_PROCESSING" },
  { label: "Submissions", path: "/submissions", moduleKey: "SUBMISSIONS" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state, retry } = useWorkspaceContext();
  const context = state.context;

  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  async function navigateModule(event: MouseEvent<HTMLAnchorElement>, module: (typeof modules)[number]) {
    if (!context) { event.preventDefault(); return; }
    if (!module.moduleKey || module.moduleKey === context.moduleKey) { setOpen(false); return; }
    event.preventDefault();
    if (switching) return;
    setSwitching(true); setSwitchError("");
    try {
      const response = await fetch("/api/nexus/context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: context.tenantId, workspaceId: context.workspaceId,
          environment: context.environment, moduleKey: module.moduleKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Module selection failed.");
      const current = getSession();
      if (current) saveSession({ ...current, moduleKey: module.moduleKey, permissions: payload.data.permissions });
      setOpen(false);
      router.push(module.path);
    } catch (error) { setSwitchError(error instanceof Error ? error.message : "Module selection failed."); }
    finally { setSwitching(false); }
  }

  function isActive(module: (typeof modules)[number]): boolean {
    if (module.path === "/") return pathname === "/";
    const prefixes = [module.path, ...(module.activePrefixes ?? [])];
    if (module.moduleKey === "LITERATURE") prefixes.push("/literature");
    return prefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  }

  const visibleModules = modules.filter(
    (module) => context && (!module.moduleKey || context.enabledModules.includes(module.moduleKey)),
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
    <div className={styles["shell-header"]}>
      <a className={styles["skip-link"]} href="#main-content">
        Skip to main content
      </a>
      <header className={styles["application-bar"]}>
        <Link className={styles["brand"]} href="/" aria-label="ClinixAI Literature Intelligence dashboard">
          <span className={styles["brand-mark"]} aria-hidden="true">
            C
          </span>
          <span className={styles["brand-copy"]}>
            <strong>ClinixAI</strong>
            <small>Nexus Safety Platform</small>
          </span>
        </Link>

        <div className={styles["utility-toolbar"]} aria-label="Global actions">
          <Link className={styles["health"]} href="/admin/reliability">System Health</Link>
          <Link className={styles["utility-action"]} href="/login">Switch workspace</Link>
          <button
            type="button"
            className={styles["utility-action"]}
            onClick={goBack}
            disabled={pathname === "/"}
            title="Go back"
          >
            ← <span>Back</span>
          </button>

          <button
            type="button"
            className={styles["utility-action"]}
            onClick={() => dispatchUtilityAction("save")}
            disabled={!isCaseWorkspace}
            title={isCaseWorkspace ? "Save current case" : "Save is available inside an editable workspace"}
          >
            Save
          </button>

          <button
            type="button"
            className={styles["utility-action"]}
            onClick={() => window.print()}
            title="Print current screen"
          >
            Print
          </button>

          <details className={styles["generate-menu"]}>
            <summary className={isCaseWorkspace ? "" : styles.disabled}>Generate</summary>
            <div className={styles["generate-popover"]}>
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

        <div className={styles["identity"]}>
          <div>
            <span>Tenant</span>
            <strong>{context?.tenantKey ?? "—"}</strong>
          </div>
          <div><span>Client</span><strong>{context?.workspaceName ?? "—"}</strong></div>
          <div>
            <span>Environment</span>
            <strong>{context?.environment ?? "—"}</strong>
          </div>
          <div>
            <span>User</span>
            <strong>{context?.email ?? "—"}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{context?.roleKey ?? "—"}</strong>
          </div>
        </div>
        <button
          type="button"
          className={styles["menu"]}
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span>
          <span className={styles["menu-label"]}>Menu</span>
        </button>
      </header>
      <nav
        id="primary-navigation"
        className={[styles["module-bar"], open ? styles.open : ""].filter(Boolean).join(" ")}
        aria-label="Primary navigation"
      >
        <div className={styles["module-links"]}>
          {visibleModules.map((module) => (
            <Link
              key={module.path}
              href={module.path}
              onClick={event => void navigateModule(event, module)}
              aria-disabled={switching}
              className={isActive(module) ? styles.active : ""}
              aria-current={isActive(module) ? "page" : undefined}
            >
              {module.label}
            </Link>
          ))}
        </div>

      </nav>
      {switchError ? <p className={styles.error} role="alert">{switchError}</p> : null}
      {<div className={styles.validation} data-verified={state.status === "authenticated_ready"} role="status">
        <span aria-hidden="true" />
        {state.status === "authenticated_ready"
          ? "Controlled environment · Tenant, module entitlement and RBAC controls active"
          : state.status === "context_error"
            ? <>Failed to load workspace context. <button type="button" onClick={retry}>Retry</button></>
            : "Verifying context..."}
      </div>}

    </div>
  );
}
