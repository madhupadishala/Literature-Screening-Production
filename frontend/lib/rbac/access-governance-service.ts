import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

import type { RequestPrincipal } from "./request-principal";
import { isPermission, isRoleKey, type Permission } from "./permissions";
import type { SaveTenantAccessRequest, TenantAccessRecord } from "./access-governance-types";

interface AccessRow {
  user_id: string;
  email: string;
  display_name: string;
  user_status: "active" | "disabled";
  role_key: string;
  permissions: unknown;
  membership_status: "active" | "disabled";
  membership_version: number;
  updated_at: string;
  updated_by_name: string | null;
}

function permissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).filter(isPermission))];
}

function mapRow(row: AccessRow): TenantAccessRecord {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    userStatus: row.user_status,
    roleKey: row.role_key,
    customPermissions: permissions(row.permissions),
    membershipStatus: row.membership_status,
    membershipVersion: Number(row.membership_version),
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by_name || undefined,
  };
}

const selectAccess = `
  SELECT user_account.id AS user_id, user_account.email, user_account.display_name,
    user_account.status AS user_status, membership.role_key, membership.permissions,
    membership.membership_status, membership.membership_version,
    membership.updated_at, updater.display_name AS updated_by_name
  FROM tenant_memberships membership
  JOIN application_users user_account ON user_account.id = membership.user_id
  LEFT JOIN application_users updater ON updater.id = membership.updated_by
`;

export async function listTenantAccess(principal: RequestPrincipal): Promise<TenantAccessRecord[]> {
  const result = await getPostgresPool().query<AccessRow>(
    `${selectAccess} WHERE membership.tenant_id = $1
     ORDER BY membership.membership_status, user_account.display_name, user_account.email`,
    [principal.tenantId],
  );
  return result.rows.map(mapRow);
}

export async function saveTenantAccess(input: {
  principal: RequestPrincipal;
  request: SaveTenantAccessRequest;
}): Promise<TenantAccessRecord> {
  const request = input.request;
  const reason = request.reason?.trim();
  if (!reason || reason.length < 10)
    throw new Error("An access-change reason of at least 10 characters is required.");
  if (!isRoleKey(request.roleKey)) throw new Error("Invalid tenant role assignment.");
  if (!["active", "disabled"].includes(request.membershipStatus))
    throw new Error("Invalid membership status.");
  const customPermissions = [...new Set(request.customPermissions || [])];
  if (!customPermissions.every(isPermission))
    throw new Error("One or more custom permissions are invalid.");
  if (request.userId === input.principal.userId) {
    throw new Error("Administrators cannot modify their own active membership.");
  }
  if (!request.userId && (!request.email?.trim() || !request.displayName?.trim())) {
    throw new Error("Email and display name are required for a new tenant member.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    let userId = request.userId?.trim();
    if (!userId) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO application_users (email, display_name, status)
         VALUES (lower($1), $2, 'active')
         ON CONFLICT (email) DO UPDATE SET
           display_name = EXCLUDED.display_name, updated_at = now()
         RETURNING id`,
        [request.email!.trim(), request.displayName!.trim()],
      );
      userId = created.rows[0].id;
    }

    const existing = await client.query<{ membership_version: number }>(
      `SELECT membership_version FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE`,
      [input.principal.tenantId, userId],
    );
    const currentVersion = Number(existing.rows[0]?.membership_version || 0);
    if (!request.userId && currentVersion > 0) {
      throw new Error(
        "This user is already a tenant member; refresh and manage the existing membership.",
      );
    }
    if (request.expectedVersion !== undefined && request.expectedVersion !== currentVersion) {
      throw new Error(
        `Access version conflict. Expected ${request.expectedVersion}, current version is ${currentVersion}.`,
      );
    }
    const nextVersion = currentVersion + 1;
    await client.query(
      `INSERT INTO tenant_memberships (
         tenant_id, user_id, role_key, permissions, membership_status,
         membership_version, updated_by, updated_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 1, $6, now())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         role_key = EXCLUDED.role_key, permissions = EXCLUDED.permissions,
         membership_status = EXCLUDED.membership_status,
         membership_version = tenant_memberships.membership_version + 1,
         updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [
        input.principal.tenantId,
        userId,
        request.roleKey,
        JSON.stringify(customPermissions),
        request.membershipStatus,
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO tenant_membership_history (
         tenant_id, user_id, membership_version, role_key, permissions,
         membership_status, changed_by, change_reason
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        input.principal.tenantId,
        userId,
        nextVersion,
        request.roleKey,
        JSON.stringify(customPermissions),
        request.membershipStatus,
        input.principal.userId,
        reason,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1, $2, 'TENANT_ACCESS_CHANGED', 'SECURITY_RBAC', 'success', $3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          targetUserId: userId,
          roleKey: request.roleKey,
          customPermissions,
          membershipStatus: request.membershipStatus,
          membershipVersion: nextVersion,
          reason,
        }),
      ],
    );
    const saved = await client.query<AccessRow>(
      `${selectAccess} WHERE membership.tenant_id = $1 AND membership.user_id = $2`,
      [input.principal.tenantId, userId],
    );
    await client.query("COMMIT");
    return mapRow(saved.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
