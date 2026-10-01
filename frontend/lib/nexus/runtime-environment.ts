import "server-only";

import {
  isNexusEnvironment,
  type NexusEnvironment,
} from "@/lib/nexus/entitlement-types";

export function getDefaultNexusEnvironment(): NexusEnvironment {
  const configured = process.env.NEXUS_DEFAULT_ENVIRONMENT?.trim().toUpperCase();
  if (configured && isNexusEnvironment(configured)) {
    return configured;
  }

  return process.env.VERCEL_ENV === "preview" ? "UAT" : "PROD";
}

export function getDefaultTenantKey(): string {
  return getDefaultNexusEnvironment() === "UAT"
    ? "nexus-uat-rc1-a"
    : "clinixai-prod";
}
