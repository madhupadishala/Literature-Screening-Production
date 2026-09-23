import "server-only";

import type { NextRequest } from "next/server";
import { getPostgresPool } from "@/lib/database/postgres";
import { isNexusEnvironment, type NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { roleHasPermission, type Permission } from "@/lib/rbac/permissions";
import { tokenService } from "@/lib/auth/token-service";

const ACCESS_TOKEN_COOKIE = "clinixai_access_token";
const REVIEW_BRANCH = "feat/nexus-horizontal-operations-shell";
const REVIEW_TENANT_KEY = "nexus-uat-rc1-a";
const REVIEW_EMAIL = "nexus.review@theclinixai.local";

export interface RequestPrincipal {
  tenantId: string;
  tenantKey: string;
  environment: NexusEnvironment;
  userId: string;
  email: string;
  displayName: string;
  roleKey: string;
  customPermissions: string[];
  hasPermission: (permission: Permission) => boolean;
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

function controlledPreviewReview(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === REVIEW_BRANCH
  );
}

function allowDemoPrincipal(): boolean {
  return (
    controlledPreviewReview() ||
    process.env.ALLOW_DEMO_PRINCIPAL?.trim().toLowerCase() === "true"
  );
}

function resolveRequestEnvironment(request: NextRequest): NexusEnvironment {
  // The controlled design-review branch must never accidentally operate in
  // PROD even if a caller sends an environment header or a project-level
  // default is misconfigured.
  if (controlledPreviewReview()) return "UAT";

  const raw =
    request.headers.get("x-nexus-environment")?.trim().toUpperCase() ||
    process.env.NEXUS_DEFAULT_ENVIRONMENT?.trim().toUpperCase() ||
    "PROD";

  if (!isNexusEnvironment(raw)) {
    throw new AuthorizationError(`Unsupported Nexus environment: ${raw}`, 403);
  }

  return raw;
}

function resolveIdentityHeaders(request: NextRequest) {
  const tenantKey =
    request.headers.get("x-tenant-key")?.trim() || request.headers.get("x-tenant-id")?.trim();
  const email = request.headers.get("x-user-email")?.trim();

  if (tenantKey && email) {
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

  if (controlledPreviewReview()) {
    return {
      tenantKey: REVIEW_TENANT_KEY,
      email: REVIEW_EMAIL,
      roleKey: "CLINIXAI_SUPER_ADMIN",
      displayName: "Nexus UAT Reviewer",
      demoFallback: true,
    };
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
      [input.tenantKey, controlledPreviewReview() ? "Nexus RC1 UAT Review" : "ClinixAI Investor Demonstration"],
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
        DO UPDATE SET role_key = EXCLUDED.role_key,
                      membership_status = 'active',
                      updated_at = now()
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

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    environment: resolveRequestEnvironment(request),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleKey,
    customPermissions,
    hasPermission: (permission) => roleHasPermission(roleKey, permission, customPermissions),
  };
}

export async function resolveRequestPrincipal(request: NextRequest): Promise<RequestPrincipal> {
  // The controlled preview review branch deliberately does not require the
  // normal signed-session path. This avoids coupling design review access to
  // production authentication secrets while keeping the exception both
  // environment- and branch-scoped. Every other environment still prefers
  // and requires the normal signed-token/identity path.
  if (!controlledPreviewReview()) {
    const signedTokenPrincipal = await resolvePrincipalFromSignedToken(request);
    if (signedTokenPrincipal) return signedTokenPrincipal;
  }

  const identity = resolveIdentityHeaders(request);

  if (identity.demoFallback) {
    await ensureDemoIdentity(identity);
  }

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

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    environment: resolveRequestEnvironment(request),
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleKey,
    customPermissions,
    hasPermission: (permission) => roleHasPermission(roleKey, permission, customPermissions),
  };
}
