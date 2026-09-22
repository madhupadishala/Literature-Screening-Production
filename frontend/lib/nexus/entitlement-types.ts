import type { NexusModuleKey } from "./modules";

export const NEXUS_ENVIRONMENTS = ["PROD", "UAT", "TRAINING"] as const;
export type NexusEnvironment = (typeof NEXUS_ENVIRONMENTS)[number];

export const ENTITLEMENT_STATUSES = ["enabled", "disabled", "suspended"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export interface TenantModuleEntitlement {
  tenantId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  status: EntitlementStatus;
  capabilities: Record<string, boolean>;
  limits: Record<string, number | string | boolean | null>;
  validFrom: string | null;
  validUntil: string | null;
  version: number;
  updatedAt: string;
}

export function isNexusEnvironment(value: string): value is NexusEnvironment {
  return (NEXUS_ENVIRONMENTS as readonly string[]).includes(value);
}

export function entitlementIsActive(
  entitlement: Pick<TenantModuleEntitlement, "status" | "validFrom" | "validUntil">,
  at = new Date(),
): boolean {
  if (entitlement.status !== "enabled") return false;

  const atMs = at.getTime();
  if (entitlement.validFrom && new Date(entitlement.validFrom).getTime() > atMs) return false;
  if (entitlement.validUntil && new Date(entitlement.validUntil).getTime() <= atMs) return false;

  return true;
}
