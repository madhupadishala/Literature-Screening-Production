"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession } from "@/lib/session-manager";

export type { WorkspaceContextData as WorkspaceIdentity } from "@/lib/nexus/workspace-context-contract";
import { isWorkspaceContextResponse, type WorkspaceContextData } from "@/lib/nexus/workspace-context-contract";

export type ContextState =
  | { status: "loading"; context: null }
  | { status: "authenticated_ready"; context: WorkspaceContextData }
  | { status: "session_expired" | "unauthenticated" | "context_error"; context: null };
const WorkspaceContext = createContext<{ state: ContextState; retry: () => void } | null>(null);

export function WorkspaceContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname === "/login" || pathname.startsWith("/login/");
  const [state, setState] = useState<ContextState>({ status: "loading", context: null });
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async (background = false) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState(current => background && current.status === "authenticated_ready" ? current : { status: "loading", context: null });
    const timeout = window.setTimeout(() => controller.abort("timeout"), 15_000);
    try {
      const response = await fetch("/api/context/current", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (pending.current !== controller) return;
      if (response.status === 401 || response.status === 403) {
        const status = response.status === 403 ? "context_error" : getSession() ? "session_expired" : "unauthenticated";
        setState({ status, context: null });
        if (response.status === 401) clearSession();
        router.replace(response.status === 403 ? "/login?reason=context_required" : `/login?reason=${status}`);
        return;
      }
      if (!response.ok) throw new Error(`Workspace context HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!isWorkspaceContextResponse(payload)) throw new Error("Invalid workspace context response");
      if (pending.current === controller) setState({ status: "authenticated_ready", context: payload.data });
    } catch (error) {
      if (pending.current !== controller) return;
      console.error("Workspace context verification failed", error instanceof Error ? error.message : "Network failure");
      setState({ status: "context_error", context: null });
    } finally { window.clearTimeout(timeout); }
  }, [router]);
  useEffect(() => {
    if (isPublic) return;
    const initial = window.setTimeout(() => void load(true), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      const controller = pending.current; pending.current = null; controller?.abort();
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [isPublic, pathname, load]);
  return <WorkspaceContext.Provider value={{ state, retry: () => void load() }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceContextProvider is required");
  return value;
}
