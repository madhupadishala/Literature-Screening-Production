"use client";

import { usePathname } from "next/navigation";
import { WorkspaceContextProvider, useWorkspaceContext } from "@/components/context/WorkspaceContext";

function VerifiedContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, retry } = useWorkspaceContext();
  if (pathname === "/login" || pathname.startsWith("/login/")) return <>{children}</>;
  if (state.status === "authenticated_ready") return <>{children}</>;
  return <div role={state.status === "context_error" ? "alert" : "status"} style={{ padding: 12, fontSize: 12 }}>
    {state.status === "context_error" ? <>Failed to load workspace context. <button type="button" onClick={retry}>Retry</button> <a href="/login">Select workspace</a></>
      : state.status === "loading" ? "Verifying context..." : "Redirecting to sign in..."}
  </div>;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <WorkspaceContextProvider><VerifiedContent>{children}</VerifiedContent></WorkspaceContextProvider>;
}
