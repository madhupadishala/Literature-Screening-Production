import "server-only";
import type { NextRequest } from "next/server";
<<<<<<< Updated upstream
import { requireIdentitySession, resolveTenantForIdentity } from "@/lib/auth/identity-principal";
import { NEXUS_CONTEXT_COOKIE, validateNexusContextToken } from "@/lib/nexus/context-token";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { evaluateWorkspaceModuleAccess } from "@/lib/nexus/workspace-access-service";
import type { NexusModuleKey } from "@/lib/nexus/modules";
import type { Permission } from "@/lib/rbac/permissions";
=======
import { getPostgresPool } from "@/lib/database/postgres";
import { isNexusEnvironment, type NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { getDefaultNexusEnvironment } from "@/lib/nexus/runtime-environment";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";
import { tokenService } from "@/lib/auth/token-service";
import { getPlatformAccess } from "@/lib/nexus/platform-rbac";
import { createUnifiedPrincipal, type UnifiedPrincipal, type UnifiedPermission } from "@/lib/rbac/unified-guard";
import { isTenantRoleKey, isPlatformRoleKey } from "@/lib/rbac/unified-roles";

const ACCESS_TOKEN_COOKIE = "clinixai_access_token";
>>>>>>> Stashed changes

/**
 * Extended RequestPrincipal with unified RBAC support
 * Maintains backward compatibility with legacy hasPermission
 */
export interface RequestPrincipal {
  tenantId: string;
  tenantKey: string;
  workspaceId?: string;
  moduleKey?: NexusModuleKey;
  environment: NexusEnvironment;
  userId: string;
  email: string;
  displayName: string;
  roleKey: string;
  customPermissions: string[];
  platformRoleKey?: string;
  hasPermission: (permission: Permission) => boolean;

  // New unified permission check (optional for backward compatibility)
  unifiedPrincipal?: UnifiedPrincipal;
  hasUnifiedPermission?: (permission: UnifiedPermission) => boolean;
}

export class AuthorizationError extends Error {
  constructor(message: string, public readonly statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "AuthorizationError";
  }
}

<<<<<<< Updated upstream
/** One durable identity, one signed selection, live database authority. */
=======
function isNonProduction(): boolean {
  return process.env.NODE_ENV !== "production";
}

function allowDemoPrincipal(): boolean {
  return (
    isNonProduction() &&
    process.env.ALLOW_DEMO_PRINCIPAL?.trim().toLowerCase() === "true"
  );
}

function allowTrustedIdentityHeaders(): boolean {
  return (
    isNonProduction() &&
    process.env.ALLOW_TRUSTED_IDENTITY_HEADERS?.trim().toLowerCase() === "true"
  );
}

function resolveRequestEnvironment(request: NextRequest): NexusEnvironment {
  const raw =
    request.headers.get("x-nexus-environment")?.trim().toUpperCase() ||
    getDefaultNexusEnvironment();

  if (!isNexusEnvironment(raw)) {
    throw new AuthorizationError(`Unsupported Nexus environment: ${raw}`, 403);
  }

  return raw;
}

function resolveIdentityHeaders(request: NextRequest) {
  const tenantKey =
    request.headers.get("x-tenant-key")?.trim() || request.headers.get("x-tenant-id")?.trim();
  const email = request.headers.get("x-user-email")?.trim();

  if (tenantKey && email && allowTrustedIdentityHeaders()) {
    return {
      tenantKey,
      email,
      displayName: request.headers.get("x-user-display-name")?.trim() || email,
      demoFallback: false,
    };
  }

  if (!allowDemoPrincipal()) {
    throw new AuthorizationError("Authenticated tenant and user context is required.", 401);
  }

  return {
    tenantKey: process.env.DEFAULT_TENANT_KEY?.trim() || "demo-tenant",
    email: process.env.DEFAULT_USER_EMAIL?.trim() || "product.admin@theclinixai.local",
    roleKey: process.env.DEFAULT_ROLE_KEY?.trim() || "CLINIXAI_SUPER_ADMIN",
    displayName: process.env.DEFAULT_USER_DISPLAY_NAME?.trim() || "Product Administrator",
    demoFallback: true,
  };
}

async function ensureDemoIdentity(input: {
  tenantKey: string;
  email: string;
  roleKey?: string | null;
  displayName: string;
}): Promise<void> {
  if (!allowDemoPrincipal()) return;

  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenant = await client.query<{ id: string }>(
      `
        INSERT INTO tenants (tenant_key, display_name, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (tenant_key)
        DO UPDATE SET updated_at = now()
        RETURNING id
      `,
      [input.tenantKey, "ClinixAI Investor Demonstration"],
    );

    const user = await client.query<{ id: string }>(
      `
        INSERT INTO application_users (email, display_name, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (email)
        DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
        RETURNING id
      `,
      [input.email, input.displayName],
    );

    await client.query(
      `
        INSERT INTO tenant_memberships (
          tenant_id,
          user_id,
          role_key,
          permissions
        )
        VALUES ($1, $2, $3, '[]'::jsonb)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET role_key = EXCLUDED.role_key
      `,
      [tenant.rows[0].id, user.rows[0].id, input.roleKey || "CLINIXAI_SUPER_ADMIN"],
    );

    if ((input.roleKey || "CLINIXAI_SUPER_ADMIN") === "CLINIXAI_SUPER_ADMIN") {
      await client.query(
        `INSERT INTO platform_role_assignments (user_id, role_key, status)
         VALUES ($1, 'PLATFORM_SUPER_ADMIN', 'active')
         ON CONFLICT (user_id)
         DO UPDATE SET role_key = EXCLUDED.role_key, status = 'active', updated_at = now()`,
        [user.rows[0].id],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function resolvePrincipalFromSignedToken(
  request: NextRequest,
): Promise<RequestPrincipal | null> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) return null;

  const payload = tokenService.validate(token);
  if (!payload) return null;

  // The token proves who issued it (its HMAC signature can't be forged
  // without SESSION_SECRET) and when it was issued, but role/permissions
  // are re-read from the database on every request rather than trusted
  // from the token payload -- an admin who gets demoted or deactivated
  // mid-session loses access on their very next request, not just when
  // their token expires.
  const pool = getPostgresPool();
  const result = await pool.query<{
    tenant_id: string;
    tenant_key: string;
    user_id: string;
    email: string;
    display_name: string;
    role_key: string;
    permissions: unknown;
  }>(
    `
      SELECT
        t.id AS tenant_id,
        t.tenant_key,
        u.id AS user_id,
        u.email,
        u.display_name,
        m.role_key,
        m.permissions
      FROM tenants t
      JOIN tenant_memberships m ON m.tenant_id = t.id
      JOIN application_users u ON u.id = m.user_id
      WHERE t.id = $1
        AND u.id = $2
        AND t.status = 'active'
        AND u.status = 'active'
        AND m.membership_status = 'active'
      LIMIT 1
    `,
    [payload.tenantId, payload.userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const customPermissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];
  const roleKey = row.role_key;

  // Fetch platform role for unified RBAC
  let platformRoleKey: string | undefined;
  try {
    const platformAccess = await getPlatformAccess(row.user_id);
    if (platformAccess) {
      platformRoleKey = platformAccess.roleKey;
    }
  } catch {
    // Platform role is optional, continue without it
  }

  // Create unified principal for new RBAC system
  const unifiedPrincipal = createUnifiedPrincipal({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    tenantId: row.tenant_id,
    tenantRoleKey: isTenantRoleKey(`TENANT_${roleKey}`) ? `TENANT_${roleKey}` : undefined,
    tenantCustomPermissions: customPermissions,
    platformRoleKey: platformRoleKey && isPlatformRoleKey(`PLATFORM_${platformRoleKey}`) ? `PLATFORM_${platformRoleKey}` : platformRoleKey,
  });

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    environment: resolveRequestEnvironment(request),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleKey,
    customPermissions,
    platformRoleKey,
    hasPermission: (permission) => roleHasPermission(roleKey, permission, customPermissions),
    unifiedPrincipal,
    hasUnifiedPermission: (permission) => unifiedPrincipal.hasPermission(permission),
  };
}

>>>>>>> Stashed changes
export async function resolveRequestPrincipal(request: NextRequest): Promise<RequestPrincipal> {
  const identity = await requireIdentitySession(request);
  const raw = request.cookies.get(NEXUS_CONTEXT_COOKIE)?.value;
  const context = raw ? validateNexusContextToken(raw) : null;
  if (!context || context.userId !== identity.userId || context.sessionId !== identity.sessionId) {
    throw new AuthorizationError("Select an authorized tenant, client workspace, environment and module.", 403);
  }
<<<<<<< Updated upstream
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
=======

  const pool = getPostgresPool();
  const result = await pool.query<{
    tenant_id: string;
    tenant_key: string;
    user_id: string;
    email: string;
    display_name: string;
    role_key: string;
    permissions: unknown;
  }>(
    `
      SELECT
        t.id AS tenant_id,
        t.tenant_key,
        u.id AS user_id,
        u.email,
        u.display_name,
        m.role_key,
        m.permissions
      FROM tenants t
      JOIN tenant_memberships m ON m.tenant_id = t.id
      JOIN application_users u ON u.id = m.user_id
      WHERE t.tenant_key = $1
        AND lower(u.email) = lower($2)
        AND t.status = 'active'
        AND u.status = 'active'
        AND m.membership_status = 'active'
      LIMIT 1
    `,
    [identity.tenantKey, identity.email],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AuthorizationError("No active tenant membership was found for this user.", 403);
  }

  const customPermissions = Array.isArray(row.permissions) ? row.permissions.map(String) : [];

  const roleKey = row.role_key;

  // Fetch platform role for unified RBAC
  let platformRoleKey: string | undefined;
  try {
    const platformAccess = await getPlatformAccess(row.user_id);
    if (platformAccess) {
      platformRoleKey = platformAccess.roleKey;
    }
  } catch {
    // Platform role is optional, continue without it
  }

  // Create unified principal for new RBAC system
  const unifiedPrincipal = createUnifiedPrincipal({
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    tenantId: row.tenant_id,
    tenantRoleKey: isTenantRoleKey(`TENANT_${roleKey}`) ? `TENANT_${roleKey}` : undefined,
    tenantCustomPermissions: customPermissions,
    platformRoleKey: platformRoleKey && isPlatformRoleKey(`PLATFORM_${platformRoleKey}`) ? `PLATFORM_${platformRoleKey}` : platformRoleKey,
  });

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    environment: resolveRequestEnvironment(request),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleKey,
    customPermissions,
    platformRoleKey,
    hasPermission: (permission) => roleHasPermission(roleKey, permission, customPermissions),
    unifiedPrincipal,
    hasUnifiedPermission: (permission) => unifiedPrincipal.hasPermission(permission),
>>>>>>> Stashed changes
  };
}
