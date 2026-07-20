import "server-only";

import type { NextRequest } from "next/server";
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
    throw new AuthorizationError(
      `Permission denied: ${permission}`,
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
      code:
        error.statusCode === 401 ? "AUTHENTICATION_REQUIRED" : "ACCESS_DENIED",
    },
    { status: error.statusCode },
  );
}
