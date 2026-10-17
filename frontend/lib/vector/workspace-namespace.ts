import "server-only";
import { createHash } from "node:crypto";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";
/** Legacy memory stores have tenant-only filters. A server-only compound namespace
 * enforces tenant + workspace + environment BEFORE similarity search/upsert. */
export function workspaceVectorNamespace(principal: RequestPrincipal): string {
  const scope = requireSafetyWorkspaceScope(principal);
  return "nexus_scope_" + createHash("sha256").update(JSON.stringify([principal.tenantId,scope.workspaceId,scope.environment])).digest("hex");
}
