"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, isAuthenticated } from "@/lib/session-manager";

const PUBLIC_PATHS = ["/login"];
const BACKEND_SESSION_CHECK_INTERVAL_MS = 60_000;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname?.startsWith(path));
  const [verified, setVerified] = useState(isPublicPath);

  useEffect(() => {
    if (isPublicPath) {
      setVerified(true);
      return;
    }

    let cancelled = false;

    async function verifyBackendSession() {
      if (!isAuthenticated()) {
        clearSession();
        if (!cancelled) {
          setVerified(false);
          router.replace("/login");
        }
        return;
      }

      try {
        const response = await fetch("/api/context/current", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          clearSession();
          if (!cancelled) {
            setVerified(false);
            router.replace("/login");
          }
          return;
        }

        if (!cancelled) setVerified(true);
      } catch {
        clearSession();
        if (!cancelled) {
          setVerified(false);
          router.replace("/login");
        }
      }
    }

    setVerified(false);
    void verifyBackendSession();

    const interval = window.setInterval(
      () => void verifyBackendSession(),
      BACKEND_SESSION_CHECK_INTERVAL_MS,
    );

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void verifyBackendSession();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPublicPath, pathname, router]);

  if (!isPublicPath && !verified) return null;

  return <>{children}</>;
}
