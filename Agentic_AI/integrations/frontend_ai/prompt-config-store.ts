import type {
  PromptArea,
  TenantPromptConfiguration,
} from "@/lib/tenant/tenant-types";

import {
  getActiveTenant,
} from "@/lib/tenant/tenant-store";

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
  area: PromptArea,
): TenantPromptConfiguration | undefined {
  const tenant = getActiveTenant();

  return tenant?.promptConfigurations.find(
    (configuration) =>
      configuration.area === area &&
      configuration.active,
  );
}

export function getPromptInstruction(
  area: PromptArea,
): string {
  const configuration =
    getPromptConfiguration(area);

  if (!configuration) {
    return "";
  }

  return configuration.instruction;
}

export function hasActivePrompt(
  area: PromptArea,
): boolean {
  return (
    getPromptConfiguration(area) !==
    undefined
  );
}

export function updatePromptConfiguration(
  updated: TenantPromptConfiguration,
): TenantPromptConfiguration {
  const tenant = getActiveTenant();

  if (!tenant) {
    throw new Error(
      "No active tenant.",
    );
  }

  const index =
    tenant.promptConfigurations.findIndex(
      (configuration) =>
        configuration.id ===
        updated.id,
    );

  if (index >= 0) {
    tenant.promptConfigurations[
      index
    ] = updated;
  } else {
    tenant.promptConfigurations.push(
      updated,
    );
  }

  return updated;
}