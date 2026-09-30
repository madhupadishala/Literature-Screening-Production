import "server-only";

import type { NextRequest } from "next/server";

import {
  NEXUS_IDENTITY_SESSION_COOKIE,
  resolveIdentitySession,
  type NexusIdentitySession,
} from "@/lib/auth/identity-session-service";
import { getPostgresPool } from "@/lib/database/postgres";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";

export class IdentityAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "IdentityAuthorizationError";
  }
}

export async function requireIdentitySession(
  request: NextRequest,
): Promise<NexusIdentitySession> {
  const raw = request.cookies.get(NEXUS_IDENTITY_SESSION_COOKIE)?.value;
  const session = await resolveIdentitySession(raw);
  if (!session) throw new IdentityAuthorizationError("Authentication is required.", 401);
  return session;
}

export interface IdentityTenantPrincipal extends NexusIdentitySession {
  tenantId: string;
  tenantKey: string;
  roleKey: string;
  customPermissions: string[];
  hasPermission: (permission: Permission) => boolean;
}

export async function resolveTenantForIdentity(input: {
  session: NexusIdentitySession;
  tenantId: string;
}): Promise<IdentityTenantPrincipal> {
  const result = await getPostgresPool().query<{
    tenant_id: string;
    tenant_key: string;
    role_key: string;
    permissions: unknown;
  }>(
    `SELECT t.id AS tenant_id, t.tenant_key, m.role_key, m.permissions
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1
        AND m.tenant_id = $2
        AND m.membership_status = 'active'
        AND t.status = 'active'
      LIMIT 1`,
    [input.session.userId, input.tenantId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new IdentityAuthorizationError("No active membership exists for the selected tenant.", 403);
  }

  const customPermissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];

  return {
    ...input.session,
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    roleKey: row.role_key,
    customPermissions,
    hasPermission: (permission) =>
      roleHasPermission(row.role_key, permission, customPermissions),
  };
}
