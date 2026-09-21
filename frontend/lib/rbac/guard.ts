import "server-only";

import type { NextRequest } from "next/server";
import { getPostgresPool } from "@/lib/database/postgres";
import { evaluateNexusAuthorization } from "@/lib/nexus/authorization-policy";
import { getModuleEntitlementAccessState } from "@/lib/nexus/entitlement-service";
import type { NexusModuleKey } from "@/lib/nexus/modules";
import {
  getPlatformAccess,
  platformRoleHasPermission,
  type PlatformPermission,
} from "@/lib/nexus/platform-rbac";
import {
  AuthorizationError,
  resolveRequestPrincipal,
  type RequestPrincipal,
} from "@/lib/rbac/request-principal";
import type { Permission } from "@/lib/rbac/permissions";

export async function requirePermission(
  request: NextRequest,
  permission: Permission,
): Promise<RequestPrincipal> {
  const principal = await resolveRequestPrincipal(request);

  if (!principal.hasPermission(permission)) {
    await getPostgresPool()
      .query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome,
           request_id, source_ip, details
         ) VALUES ($1, $2, 'AUTHORIZATION_DENIED', 'SECURITY_RBAC', 'denied',
           $3, $4, $5::jsonb)`,
        [
          principal.tenantId,
          principal.userId,
          request.headers.get("x-request-id")?.trim() || null,
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          JSON.stringify({
            permission,
            roleKey: principal.roleKey,
            method: request.method,
            pathname: request.nextUrl.pathname,
          }),
        ],
      )
      .catch(() => undefined);
    throw new AuthorizationError(`Permission denied: ${permission}`, 403);
  }

  return principal;
}


export async function requirePlatformPermission(
  request: NextRequest,
  permission: PlatformPermission,
): Promise<RequestPrincipal> {
  const principal = await resolveRequestPrincipal(request);
  const platformAccess = await getPlatformAccess(principal.userId);

  if (
    !platformAccess ||
    !platformRoleHasPermission(platformAccess.roleKey, permission)
  ) {
    await getPostgresPool()
      .query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome,
           request_id, source_ip, details
         ) VALUES ($1, $2, 'AUTHORIZATION_DENIED', 'SECURITY_PLATFORM_RBAC', 'denied',
           $3, $4, $5::jsonb)`,
        [
          principal.tenantId,
          principal.userId,
          request.headers.get("x-request-id")?.trim() || null,
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          JSON.stringify({
            permission,
            platformRoleKey: platformAccess?.roleKey ?? null,
            tenantRoleKey: principal.roleKey,
            environment: principal.environment,
            method: request.method,
            pathname: request.nextUrl.pathname,
          }),
        ],
      )
      .catch(() => undefined);

    throw new AuthorizationError(
      `Platform permission denied: ${permission}`,
      403,
    );
  }

  return principal;
}

export async function requireModulePermission(
  request: NextRequest,
  moduleKey: NexusModuleKey,
  permission: Permission,
): Promise<RequestPrincipal> {
  const principal = await resolveRequestPrincipal(request);
  const entitlement = await getModuleEntitlementAccessState(
    principal.tenantId,
    principal.environment,
    moduleKey,
  );

  const decision = evaluateNexusAuthorization({
    tenantActive: true,
    environmentAllowed: true,
    moduleKey,
    moduleEnabled: entitlement.moduleEnabled,
    dependenciesEnabled: entitlement.dependenciesEnabled,
    permissionAllowed: principal.hasPermission(permission),
  });

  if (!decision.allowed) {
    await getPostgresPool()
      .query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome,
           request_id, source_ip, details
         ) VALUES ($1, $2, 'AUTHORIZATION_DENIED', 'SECURITY_ENTITLEMENT', 'denied',
           $3, $4, $5::jsonb)`,
        [
          principal.tenantId,
          principal.userId,
          request.headers.get("x-request-id")?.trim() || null,
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          JSON.stringify({
            moduleKey,
            permission,
            roleKey: principal.roleKey,
            environment: principal.environment,
            reason: decision.reason,
            missingDependencies: entitlement.missingDependencies,
            method: request.method,
            pathname: request.nextUrl.pathname,
          }),
        ],
      )
      .catch(() => undefined);

    throw new AuthorizationError(
      `Module access denied for ${moduleKey}: ${decision.reason}`,
      403,
    );
  }

  return principal;
}

export function authorizationResponse(error: unknown): Response | null {
  if (!(error instanceof AuthorizationError)) return null;

  return Response.json(
    {
      success: false,
      error: error.message,
      code: error.statusCode === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
    },
    { status: error.statusCode },
  );
}
