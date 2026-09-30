import "server-only";

import type { ScopedIdentityPrincipal } from "@/lib/rbac/workspace-guard";
import { WorkspaceAuthorizationError } from "@/lib/rbac/workspace-guard";

/**
 * Request tenant identifiers are selectors/data, never authority.
 * When legacy payloads still carry tenantId/tenantKey, they must match the
 * already-authorized workspace context before the value is accepted.
 */
export function assertRequestedTenantMatchesScope(
  principal: ScopedIdentityPrincipal,
  requestedTenant: unknown,
): void {
  if (requestedTenant === undefined || requestedTenant === null || requestedTenant === "") {
    return;
  }

  if (typeof requestedTenant !== "string") {
    throw new WorkspaceAuthorizationError("Requested tenant is invalid.", 403);
  }

  const normalized = requestedTenant.trim();
  if (
    normalized !== principal.tenantId &&
    normalized !== principal.tenantKey
  ) {
    throw new WorkspaceAuthorizationError(
      "Requested tenant does not match the selected Nexus workspace context.",
      403,
    );
  }
}
