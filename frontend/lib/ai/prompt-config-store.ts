import type { PromptArea, TenantPromptConfiguration } from "@/lib/tenant/tenant-types";
import { getActiveTenant } from "@/lib/tenant/tenant-store";

export interface PromptConfigurationResponse {
  tenantId: string | null;
  prompts: TenantPromptConfiguration[];
}

export function getPromptConfigurations(): PromptConfigurationResponse {
  const tenant = getActiveTenant();

  return {
    tenantId: tenant?.id ?? null,
    prompts: tenant?.promptConfigurations ?? [],
  };
}

export function getPromptConfiguration(
  area: PromptArea
): TenantPromptConfiguration | undefined {
  const tenant = getActiveTenant();

  return tenant?.promptConfigurations.find(
    (p) => p.area === area && p.active
  );
}

export function updatePromptConfiguration(
  updated: TenantPromptConfiguration
): TenantPromptConfiguration {
  const tenant = getActiveTenant();

  if (!tenant) {
    throw new Error("No active tenant.");
  }

  const index = tenant.promptConfigurations.findIndex(
    (p) => p.id === updated.id
  );

  if (index >= 0) {
    tenant.promptConfigurations[index] = updated;
  } else {
    tenant.promptConfigurations.push(updated);
  }

  return updated;
}