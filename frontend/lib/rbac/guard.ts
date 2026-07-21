import "server-only";

import type { NextRequest } from "next/server";
import { getPostgresPool } from "@/lib/database/postgres";
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
