import "server-only";

import type { NextRequest } from "next/server";

import { requireIdentitySession, resolveTenantForIdentity } from "@/lib/auth/identity-principal";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  NEXUS_CONTEXT_COOKIE,
  validateNexusContextToken,
} from "@/lib/nexus/context-token";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import type { NexusModuleKey } from "@/lib/nexus/modules";
import {
  evaluateWorkspaceModuleAccess,
  type NexusWorkspaceModuleRole,
  type NexusWorkspaceRole,
} from "@/lib/nexus/workspace-access-service";
import type { Permission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export class WorkspaceAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "WorkspaceAuthorizationError";
  }
}

export interface ScopedIdentityPrincipal extends RequestPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  tenantId: string;
  tenantKey: string;
  environment: NexusEnvironment;
  workspaceId: string;
  workspaceKey: string;
  workspaceRole: NexusWorkspaceRole;
  moduleKey: NexusModuleKey;
  moduleRoles: NexusWorkspaceModuleRole[];
}

async function auditDenial(input: {
  request: NextRequest;
  userId: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  environment?: NexusEnvironment | null;
  moduleKey: NexusModuleKey;
  permission: Permission;
  reason: string;
}) {
  await getPostgresPool()
    .query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, request_id, source_ip, details
       ) VALUES ($1,$2,$3,$4,$5,'WORKSPACE_AUTHORIZATION_DENIED','SECURITY_RBAC','denied',$6,$7,$8::jsonb)`,
      [
        input.tenantId ?? null,
        input.workspaceId ?? null,
        input.environment ?? null,
        input.moduleKey,
        input.userId,
        input.request.headers.get("x-request-id")?.trim() || null,
        input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        JSON.stringify({
          permission: input.permission,
          reason: input.reason,
          pathname: input.request.nextUrl.pathname,
          method: input.request.method,
        }),
      ],
    )
    .catch(() => undefined);
}

/**
 * Identity -> tenant -> workspace -> environment -> module -> role -> permission.
 * Context cookie only selects scope; mutable authority is re-read from PostgreSQL.
 */
async function requireScopedWorkspaceModulePermission(
  request: NextRequest,
  moduleKey: NexusModuleKey,
  permission: Permission,
  requireContextModuleMatch: boolean,
): Promise<ScopedIdentityPrincipal> {
  const identity = await requireIdentitySession(request);
  const rawContext = request.cookies.get(NEXUS_CONTEXT_COOKIE)?.value;

  if (!rawContext) {
    await auditDenial({
      request,
      userId: identity.userId,
      moduleKey,
      permission,
      reason: "WORKSPACE_CONTEXT_REQUIRED",
    });
    throw new WorkspaceAuthorizationError("Select a Nexus tenant, workspace and module first.", 403);
  }

  const context = validateNexusContextToken(rawContext);
  if (
    !context ||
    context.sessionId !== identity.sessionId ||
    context.userId !== identity.userId ||
    (requireContextModuleMatch && context.moduleKey !== moduleKey)
  ) {
    await auditDenial({
      request,
      userId: identity.userId,
      tenantId: context?.tenantId,
      workspaceId: context?.workspaceId,
      environment: context?.environment,
      moduleKey,
      permission,
      reason: "WORKSPACE_CONTEXT_INVALID",
    });
    throw new WorkspaceAuthorizationError("The selected Nexus context is invalid or expired.", 403);
  }

  const tenant = await resolveTenantForIdentity({
    session: identity,
    tenantId: context.tenantId,
  });

  if (!tenant.hasPermission(permission)) {
    await auditDenial({
      request,
      userId: identity.userId,
      tenantId: tenant.tenantId,
      workspaceId: context.workspaceId,
      environment: context.environment,
      moduleKey,
      permission,
      reason: "TENANT_PERMISSION_DENIED",
    });
    throw new WorkspaceAuthorizationError(`Permission denied: ${permission}`, 403);
  }

  const access = await evaluateWorkspaceModuleAccess({
    tenantId: tenant.tenantId,
    userId: identity.userId,
    workspaceId: context.workspaceId,
    environment: context.environment,
    moduleKey,
    permission,
  });

  if (!access.allowed || !access.workspaceKey || !access.workspaceRole) {
    await auditDenial({
      request,
      userId: identity.userId,
      tenantId: tenant.tenantId,
      workspaceId: context.workspaceId,
      environment: context.environment,
      moduleKey,
      permission,
      reason: access.reason,
    });
    throw new WorkspaceAuthorizationError(
      `Workspace/module permission denied: ${access.reason}`,
      403,
    );
  }

  return {
    sessionId: identity.sessionId,
    userId: identity.userId,
    email: identity.email,
    displayName: identity.displayName,
    tenantId: tenant.tenantId,
    tenantKey: tenant.tenantKey,
    environment: context.environment,
    roleKey: tenant.roleKey,
    customPermissions: access.effectivePermissions,
    hasPermission: (candidatePermission) =>
      tenant.hasPermission(candidatePermission) &&
      access.effectivePermissions.includes(candidatePermission),
    workspaceId: context.workspaceId,
    workspaceKey: access.workspaceKey,
    workspaceRole: access.workspaceRole,
    moduleKey,
    moduleRoles: access.moduleRoles,
  };
}


/**
 * Standard module guard. The selected context module must match the route module.
 */
export async function requireWorkspaceModulePermission(
  request: NextRequest,
  moduleKey: NexusModuleKey,
  permission: Permission,
): Promise<ScopedIdentityPrincipal> {
  return requireScopedWorkspaceModulePermission(
    request,
    moduleKey,
    permission,
    true,
  );
}

/**
 * Authorize an additional module inside the already-selected tenant/workspace/environment.
 *
 * Use only after the route has authorized its primary selected module. This supports
 * canonical cross-module handoffs (for example Intake -> Case Processing) without
 * treating a client-supplied selector as authority or requiring a second login.
 */
export async function requireAdditionalModulePermissionInSelectedWorkspace(
  request: NextRequest,
  moduleKey: NexusModuleKey,
  permission: Permission,
): Promise<ScopedIdentityPrincipal> {
  return requireScopedWorkspaceModulePermission(
    request,
    moduleKey,
    permission,
    false,
  );
}
