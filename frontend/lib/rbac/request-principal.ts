import "server-only";
import type { NextRequest } from "next/server";
import { requireIdentitySession, resolveTenantForIdentity } from "@/lib/auth/identity-principal";
import { NEXUS_CONTEXT_COOKIE, validateNexusContextToken } from "@/lib/nexus/context-token";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { evaluateWorkspaceModuleAccess } from "@/lib/nexus/workspace-access-service";
import type { Permission } from "@/lib/rbac/permissions";

export interface RequestPrincipal {
  tenantId: string;
  tenantKey: string;
  workspaceId?: string;
  moduleKey?: string;
  environment: NexusEnvironment;
  userId: string;
  email: string;
  displayName: string;
  roleKey: string;
  customPermissions: string[];
  hasPermission: (permission: Permission) => boolean;
}

export class AuthorizationError extends Error {
  constructor(message: string, public readonly statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** One durable identity, one signed selection, live database authority. */
export async function resolveRequestPrincipal(request: NextRequest): Promise<RequestPrincipal> {
  const identity = await requireIdentitySession(request);
  const raw = request.cookies.get(NEXUS_CONTEXT_COOKIE)?.value;
  const context = raw ? validateNexusContextToken(raw) : null;
  if (!context || context.userId !== identity.userId || context.sessionId !== identity.sessionId) {
    throw new AuthorizationError("Select an authorized tenant, client workspace, environment and module.", 403);
  }
  const tenant = await resolveTenantForIdentity({ session: identity, tenantId: context.tenantId });
  const access = await evaluateWorkspaceModuleAccess({
    tenantId: tenant.tenantId, userId: identity.userId, workspaceId: context.workspaceId,
    environment: context.environment, moduleKey: context.moduleKey,
  });
  if (!access.allowed) throw new AuthorizationError("Selected workspace access is no longer active.", 403);
  return {
    ...tenant,
    environment: context.environment,
    workspaceId: context.workspaceId,
    moduleKey: context.moduleKey,
    customPermissions: access.effectivePermissions,
    hasPermission: permission => tenant.hasPermission(permission) && access.effectivePermissions.includes(permission),
  };
}
