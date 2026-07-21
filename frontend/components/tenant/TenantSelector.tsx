"use client";

import { useState } from "react";

import { useDeferredLoad } from "@/hooks/use-deferred-load";
import type { TenantConfiguration } from "@/lib/tenant/tenant-types";

type TenantConfigSnapshot = {
  tenants: TenantConfiguration[];
  activeTenantId: string | null;
};

export default function TenantSelector() {
  const [tenants, setTenants] = useState<TenantConfiguration[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTenants() {
    setLoading(true);

    const response = await fetch("/api/tenant/config", {
      cache: "no-store",
    });

    const data = (await response.json()) as TenantConfigSnapshot;

    setTenants(data.tenants ?? []);
    setActiveTenantId(data.activeTenantId ?? null);
    setLoading(false);
  }

  async function handleTenantChange(tenantId: string) {
    setActiveTenantId(tenantId);

    await fetch("/api/tenant/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId }),
    });
  }

  useDeferredLoad(loadTenants);

  if (loading) {
    return <span>Loading tenants...</span>;
  }

  return (
    <select
      value={activeTenantId ?? ""}
      onChange={(event) => handleTenantChange(event.target.value)}
    >
      {tenants.map((tenant) => (
        <option key={tenant.id} value={tenant.id}>
          {tenant.displayName} · {tenant.environment}
        </option>
      ))}
    </select>
  );
}
