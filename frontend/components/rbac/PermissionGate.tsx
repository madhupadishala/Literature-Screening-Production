"use client";

import { ReactNode, useEffect, useState } from "react";

import type { PermissionAction } from "@/lib/rbac/rbac-rules";

type PermissionGateProps = {
  permission: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
};

type PermissionResponse = {
  allowed: boolean;
  reason?: string;
};

export default function PermissionGate({
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const [allowed, setAllowed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const response = await fetch("/api/rbac/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permission }),
      });

      const data = (await response.json()) as PermissionResponse;

      setAllowed(Boolean(data.allowed));
      setLoaded(true);
    }

    checkAccess();
  }, [permission]);

  if (!loaded) {
    return null;
  }

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}