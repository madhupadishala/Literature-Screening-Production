import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

import { verifyPassword } from "./password";
import { mapRoleKeyToUserRole } from "./role-mapping";
import type { UserRole } from "./auth-types";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface IdentityRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  status: string;
}

export type IdentityCredentialCheckResult =
  | {
      ok: true;
      userId: string;
      email: string;
      displayName: string;
    }
  | { ok: false; reason: "invalid_credentials" | "account_locked" };

export type CredentialCheckResult =
  | {
      ok: true;
      userId: string;
      email: string;
      displayName: string;
      tenantId: string;
      role: UserRole;
      roleKey: string;
    }
  | { ok: false; reason: "invalid_credentials" | "account_locked" | "no_active_membership" };

async function authenticateIdentity(
  email: string,
  password: string,
): Promise<IdentityCredentialCheckResult> {
  const pool = getPostgresPool();

  const userResult = await pool.query<IdentityRow>(
    `SELECT id, email, display_name, password_hash, failed_login_attempts, locked_until, status
       FROM application_users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email],
  );

  const user = userResult.rows[0];

  // Deliberately identical failure path for missing users and wrong passwords.
  if (!user || user.status !== "active") {
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: "account_locked" };
  }

  const passwordValid = await verifyPassword(password, user.password_hash);

  if (!passwordValid) {
    const lockoutResult = await pool.query<{ failed_login_attempts: number }>(
      `UPDATE application_users
          SET failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE
                WHEN failed_login_attempts + 1 >= $2
                  THEN now() + ($3::text || ' minutes')::interval
                ELSE locked_until
              END,
              updated_at = now()
        WHERE id = $1
        RETURNING failed_login_attempts`,
      [user.id, MAX_FAILED_ATTEMPTS, String(LOCKOUT_MINUTES)],
    );

    return {
      ok: false,
      reason:
        (lockoutResult.rows[0]?.failed_login_attempts ?? 0) >= MAX_FAILED_ATTEMPTS
          ? "account_locked"
          : "invalid_credentials",
    };
  }

  await pool.query(
    `UPDATE application_users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [user.id],
  );

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
  };
}

/**
 * Identity-first authentication. No tenant/client/module selection is accepted
 * or trusted during credential verification.
 */
export async function verifyIdentityCredentials(
  email: string,
  password: string,
): Promise<IdentityCredentialCheckResult> {
  return authenticateIdentity(email, password);
}

/**
 * Legacy tenant-first compatibility path.
 * New Nexus flows shall authenticate identity first and select tenant/workspace
 * through the scoped context APIs.
 */
export async function verifyCredentials(
  email: string,
  password: string,
  tenantKey: string,
): Promise<CredentialCheckResult> {
  const identity = await authenticateIdentity(email, password);
  if (!identity.ok) return identity;

  const membershipResult = await getPostgresPool().query<{
    tenant_id: string;
    role_key: string;
  }>(
    `SELECT t.id AS tenant_id, m.role_key
       FROM tenant_memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE t.tenant_key = $1
        AND m.user_id = $2
        AND t.status = 'active'
        AND m.membership_status = 'active'
      LIMIT 1`,
    [tenantKey, identity.userId],
  );

  const membership = membershipResult.rows[0];

  if (!membership) {
    return { ok: false, reason: "no_active_membership" };
  }

  return {
    ok: true,
    userId: identity.userId,
    email: identity.email,
    displayName: identity.displayName,
    tenantId: membership.tenant_id,
    role: mapRoleKeyToUserRole(membership.role_key),
    roleKey: membership.role_key,
  };
}
