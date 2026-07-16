"use client";

import { useEffect, useState } from "react";

import {
  createDefaultTenant,
  defaultTenantFeatureFlags,
} from "@/lib/tenant/tenant-store";

import type { TenantConfiguration } from "@/lib/tenant/tenant-types";

type TenantConfigSnapshot = {
  tenants: TenantConfiguration[];
  activeTenantId: string | null;
};

function createTenantDraft(): TenantConfiguration {
  const base = createDefaultTenant();
  const timestamp = new Date().toISOString();

  return {
    ...base,
    id: `tenant-${Date.now()}`,
    tenantName: "",
    displayName: "",
    status: "sandbox",
    environment: "TEST",
    productMaster: [],
    literatureCalendar: [],
    knowledgeSources: [],
    promptConfigurations: [],
    featureFlags: defaultTenantFeatureFlags,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export default function TenantConfigPanel() {
  const [tenants, setTenants] = useState<TenantConfiguration[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] =
    useState<TenantConfiguration | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadTenants() {
    const response = await fetch("/api/tenant/config", {
      cache: "no-store",
    });

    const data = (await response.json()) as TenantConfigSnapshot;

    setTenants(data.tenants ?? []);
    setActiveTenantId(data.activeTenantId ?? null);

    const activeTenant =
      data.tenants.find((tenant) => tenant.id === data.activeTenantId) ??
      data.tenants[0] ??
      null;

    setSelectedTenant(activeTenant);
  }

  async function saveTenant() {
    if (!selectedTenant) return;

    setSaving(true);

    const response = await fetch("/api/tenant/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenant: selectedTenant }),
    });

    if (response.ok) {
      await loadTenants();
    }

    setSaving(false);
  }

  async function switchTenant(tenantId: string) {
    await fetch("/api/tenant/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId }),
    });

    await loadTenants();
  }

  async function deleteTenant(tenantId: string) {
    await fetch("/api/tenant/config", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenantId }),
    });

    await loadTenants();
  }

  useEffect(() => {
    loadTenants();
  }, []);

  return (
    <section>
      <div>
        <h2>Tenant Configuration</h2>
        <p>
          Manage client-specific product master, literature calendar, knowledge
          base sources and prompt configuration.
        </p>
      </div>

      <button type="button" onClick={() => setSelectedTenant(createTenantDraft())}>
        New Tenant
      </button>

      <div>
        <h3>Configured Tenants</h3>

        {tenants.map((tenant) => (
          <div key={tenant.id}>
            <strong>{tenant.displayName}</strong>
            <span> · {tenant.environment}</span>
            <span> · {tenant.status}</span>

            {tenant.id === activeTenantId && <span> · Active</span>}

            <div>
              <button type="button" onClick={() => setSelectedTenant(tenant)}>
                Edit
              </button>

              <button type="button" onClick={() => switchTenant(tenant.id)}>
                Set Active
              </button>

              <button type="button" onClick={() => deleteTenant(tenant.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedTenant && (
        <div>
          <h3>Tenant Details</h3>

          <label>
            Display Name
            <input
              value={selectedTenant.displayName}
              onChange={(event) =>
                setSelectedTenant({
                  ...selectedTenant,
                  displayName: event.target.value,
                })
              }
            />
          </label>

          <label>
            Tenant Name
            <input
              value={selectedTenant.tenantName}
              onChange={(event) =>
                setSelectedTenant({
                  ...selectedTenant,
                  tenantName: event.target.value,
                })
              }
            />
          </label>

          <label>
            Environment
            <select
              value={selectedTenant.environment}
              onChange={(event) =>
                setSelectedTenant({
                  ...selectedTenant,
                  environment: event.target.value as "TEST" | "PROD",
                })
              }
            >
              <option value="TEST">TEST</option>
              <option value="PROD">PROD</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={selectedTenant.status}
              onChange={(event) =>
                setSelectedTenant({
                  ...selectedTenant,
                  status: event.target.value as TenantConfiguration["status"],
                })
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </label>

          <h4>Feature Flags</h4>

          {Object.entries(selectedTenant.featureFlags).map(([key, value]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={value}
                onChange={(event) =>
                  setSelectedTenant({
                    ...selectedTenant,
                    featureFlags: {
                      ...selectedTenant.featureFlags,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {key}
            </label>
          ))}

          <h4>Configuration Summary</h4>

          <p>Products: {selectedTenant.productMaster.length}</p>
          <p>Calendar Entries: {selectedTenant.literatureCalendar.length}</p>
          <p>Knowledge Sources: {selectedTenant.knowledgeSources.length}</p>
          <p>
            Prompt Configurations:{" "}
            {selectedTenant.promptConfigurations.length}
          </p>

          <button type="button" onClick={saveTenant} disabled={saving}>
            {saving ? "Saving..." : "Save Tenant"}
          </button>
        </div>
      )}
    </section>
  );
}