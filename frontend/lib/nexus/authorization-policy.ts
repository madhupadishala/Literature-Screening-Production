import type { NexusModuleKey } from "./modules";

export type NexusAuthorizationDenial =
  | "TENANT_INACTIVE"
  | "ENVIRONMENT_DENIED"
  | "MODULE_NOT_ENTITLED"
  | "MODULE_DEPENDENCY_NOT_ENTITLED"
  | "PERMISSION_DENIED";

export interface NexusAuthorizationInput {
  tenantActive: boolean;
  environmentAllowed: boolean;
  moduleKey: NexusModuleKey;
  moduleEnabled: boolean;
  dependenciesEnabled: boolean;
  permissionAllowed: boolean;
}

export type NexusAuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason: NexusAuthorizationDenial };

export function evaluateNexusAuthorization(
  input: NexusAuthorizationInput,
): NexusAuthorizationDecision {
  if (!input.tenantActive) return { allowed: false, reason: "TENANT_INACTIVE" };
  if (!input.environmentAllowed) return { allowed: false, reason: "ENVIRONMENT_DENIED" };
  if (!input.moduleEnabled) return { allowed: false, reason: "MODULE_NOT_ENTITLED" };
  if (!input.dependenciesEnabled) {
    return { allowed: false, reason: "MODULE_DEPENDENCY_NOT_ENTITLED" };
  }
  if (!input.permissionAllowed) return { allowed: false, reason: "PERMISSION_DENIED" };
  return { allowed: true };
}
