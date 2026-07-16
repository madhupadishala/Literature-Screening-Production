"use client";

import { useState } from "react";
import { getSession, saveSession } from "@/lib/session-manager";

const TENANTS = [
  { tenantId: "demo-tenant", tenantName: "Demo Tenant" },
  { tenantId: "novartis-prod", tenantName: "Novartis Workspace" },
  { tenantId: "uat-tenant", tenantName: "UAT Workspace" },
  { tenantId: "training-tenant", tenantName: "Training Workspace" },
];

export default function TenantSwitcher() {
  const [session, setSession] = useState(() => getSession());

  function switchTenant(tenantId: string) {
    const tenant = TENANTS.find((item) => item.tenantId === tenantId);
    if (!tenant) return;

    const updated = {
      ...session,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      lastActivity: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    saveSession(updated);
    setSession(updated);
    window.location.reload();
  }

  return (
    <div className="tenant-switcher">
      <label>Tenant</label>

      <select value={session.tenantId} onChange={(event) => switchTenant(event.target.value)}>
        {TENANTS.map((tenant) => (
          <option key={tenant.tenantId} value={tenant.tenantId}>
            {tenant.tenantName}
          </option>
        ))}
      </select>

      <style jsx>{`
        .tenant-switcher {
          display: flex;
          gap: 8px;
          align-items: center;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 8px 10px;
          border-radius: 999px;
        }

        label {
          color: #cfe7ff;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        select {
          border: none;
          background: transparent;
          color: #ffffff;
          font-weight: 800;
          outline: none;
        }

        option {
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}