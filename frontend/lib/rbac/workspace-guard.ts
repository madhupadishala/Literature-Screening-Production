import "server-only";

import type { NextRequest } from "next/server";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  NEXUS_CONTEXT_COOKIE,
  validateNexusContextToken,
} from "@/lib/nexus/context-token";
import type { NexusModuleKey } from "@/lib/nexus/modules";
import {
  evaluateWorkspaceModuleAccess,
  type NexusWorkspaceModuleRole,
  type NexusWorkspaceRole,
} from "@/lib/nexus/workspace-access-service";
import {
  AuthorizationError,
  resolveRequestPrincipal,
  type RequestPrincipal,
} from "@/lib/rbac/request-principal";
import type { Permission } from "@/lib/rbac/permissions";

export interface ScopedRequestPrincipal extends RequestPrincipal {
  workspaceId: string;
  workspaceKey: string;
  workspaceRole: NexusWorkspaceRole;
  moduleKey: NexusModuleKey;
  moduleRoles: NexusWorkspaceModuleRole[];
}

async function auditDenial(input: {
  request: NextRequest;
  principal: RequestPrincipal;
  workspaceId?: string | null;
  moduleKey: NexusModuleKey;
  permission: Permission;
  reason: string;
}) {
  await getPostgresPool()
    .query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, actor_id, event_type, event_category, outcome,
         request_id, source_ip, details
       ) VALUES ($1,$2,$3,'WORKSPACE_AUTHORIZATION_DENIED','SECURITY_RBAC','denied',$4,$5,$6::jsonb)`,
      [
        input.principal.tenantId,
        input.workspaceId ?? null,
        input.principal.userId,
        input.request.headers.get("x-request-id")?.trim() || null,
        input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        JSON.stringify({
          moduleKey: input.moduleKey,
          permission: input.permission,
          environment: input.principal.environment,
          reason: input.reason,
          pathname: input.request.nextUrl.pathname,
          method: input.request.method,
        }),
      ],
    )
    .catch(() => undefined);
}

/**
 * Enforces the complete Nexus access chain:
 * authenticated identity -> active tenant membership -> active client workspace
 * membership -> parent tenant module entitlement -> workspace module entitlement
 * -> workspace module role -> tenant permission -> workspace-role permission.
 *
 * The browser-supplied URL/header is never treated as authority. The selected
 * workspace/module comes from a signed HttpOnly context cookie and all mutable
 * access state is re-read from PostgreSQL on every protected request.
 */
export async function requireWorkspaceModulePermission(
  request: NextRequest,
  moduleKey: NexusModuleKey,
  permission: Permission,
): Promise<ScopedRequestPrincipal> {
  const principal = await resolveRequestPrincipal(request);
  const rawContext = request.cookies.get(NEXUS_CONTEXT_COOKIE)?.value;

  if (!rawContext) {
    await auditDenial({
      request,
      principal,
      moduleKey,
      permission,
      reason: "WORKSPACE_CONTEXT_REQUIRED",
    });
    throw new AuthorizationError("Select a Nexus client workspace and module first.", 403);
  }

  const context = validateNexusContextToken(rawContext);
  if (
    !context ||
    context.userId !== principal.userId ||
    context.tenantId !== principal.tenantId ||
    context.environment !== principal.environment ||
    context.moduleKey !== moduleKey
  ) {
    await auditDenial({
      request,
      principal,
      workspaceId: context?.workspaceId,
      moduleKey,
      permission,
      reason: "WORKSPACE_CONTEXT_INVALID",
    });
    throw new AuthorizationError("The selected Nexus workspace context is invalid or expired.", 403);
  }

  if (!principal.hasPermission(permission)) {
    await auditDenial({
      request,
      principal,
      workspaceId: context.workspaceId,
      moduleKey,
      permission,
      reason: "TENANT_PERMISSION_DENIED",
    });
    throw new AuthorizationError(`Permission denied: ${permission}`, 403);
  }

  const access = await evaluateWorkspaceModuleAccess({
    tenantId: principal.tenantId,
    userId: principal.userId,
    workspaceId: context.workspaceId,
    environment: principal.environment,
    moduleKey,
    permission,
  });

  if (
    !access.allowed ||
    !access.workspaceKey ||
    !access.workspaceRole
  ) {
    await auditDenial({
      request,
      principal,
      workspaceId: context.workspaceId,
      moduleKey,
      permission,
      reason: access.reason,
    });
    throw new AuthorizationError(
      `Workspace/module permission denied: ${access.reason}`,
      403,
    );
  }

  return {
    ...principal,
    workspaceId: context.workspaceId,
    workspaceKey: access.workspaceKey,
    workspaceRole: access.workspaceRole,
    moduleKey,
    moduleRoles: access.moduleRoles,
  };
}
