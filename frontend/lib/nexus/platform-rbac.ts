import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export const PLATFORM_PERMISSIONS = {
  ENTITLEMENT_VIEW: "platform.entitlement.view",
  ENTITLEMENT_MANAGE: "platform.entitlement.manage",
  TENANT_PROVISION: "platform.tenant.provision",
  TENANT_MANAGE: "platform.tenant.manage",
  SUPPORT_ACCESS: "platform.support.access",
  VALIDATION_ADMIN: "platform.validation.admin",
  PLATFORM_AUDIT_VIEW: "platform.audit.view",
} as const;

export type PlatformPermission =
  (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export const PLATFORM_ROLES = {
  SUPER_ADMIN: "PLATFORM_SUPER_ADMIN",
  SECURITY_ADMIN: "PLATFORM_SECURITY_ADMIN",
  QA_ADMIN: "PLATFORM_QA_ADMIN",
  SUPPORT: "PLATFORM_SUPPORT",
  AUDITOR: "PLATFORM_AUDITOR",
} as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  PLATFORM_SUPER_ADMIN: Object.values(PLATFORM_PERMISSIONS),
  PLATFORM_SECURITY_ADMIN: [
    PLATFORM_PERMISSIONS.ENTITLEMENT_VIEW,
    PLATFORM_PERMISSIONS.ENTITLEMENT_MANAGE,
    PLATFORM_PERMISSIONS.TENANT_MANAGE,
    PLATFORM_PERMISSIONS.SUPPORT_ACCESS,
    PLATFORM_PERMISSIONS.PLATFORM_AUDIT_VIEW,
  ],
  PLATFORM_QA_ADMIN: [
    PLATFORM_PERMISSIONS.ENTITLEMENT_VIEW,
    PLATFORM_PERMISSIONS.VALIDATION_ADMIN,
    PLATFORM_PERMISSIONS.PLATFORM_AUDIT_VIEW,
  ],
  PLATFORM_SUPPORT: [
    PLATFORM_PERMISSIONS.ENTITLEMENT_VIEW,
    PLATFORM_PERMISSIONS.SUPPORT_ACCESS,
  ],
  PLATFORM_AUDITOR: [
    PLATFORM_PERMISSIONS.ENTITLEMENT_VIEW,
    PLATFORM_PERMISSIONS.PLATFORM_AUDIT_VIEW,
  ],
};

export interface PlatformAccess {
  userId: string;
  roleKey: PlatformRole;
  status: "active" | "disabled";
  permissions: readonly PlatformPermission[];
}

export function platformRoleHasPermission(
  roleKey: PlatformRole,
  permission: PlatformPermission,
): boolean {
  return PLATFORM_ROLE_PERMISSIONS[roleKey]?.includes(permission) ?? false;
}

export async function getPlatformAccess(userId: string): Promise<PlatformAccess | null> {
  const result = await getPostgresPool().query<{
    user_id: string;
    role_key: PlatformRole;
    status: "active" | "disabled";
  }>(
    `SELECT user_id, role_key, status
       FROM platform_role_assignments
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row || row.status !== "active") return null;

  return {
    userId: row.user_id,
    roleKey: row.role_key,
    status: row.status,
    permissions: PLATFORM_ROLE_PERMISSIONS[row.role_key] ?? [],
  };
}
