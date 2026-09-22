import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import {
  PLATFORM_ROLE_PERMISSIONS,
  platformRoleHasPermission,
  type PlatformPermission,
  type PlatformRole,
} from "@/lib/nexus/platform-permissions";

export { platformRoleHasPermission };
export type { PlatformPermission, PlatformRole };

export interface PlatformAccess {
  userId: string;
  roleKey: PlatformRole;
  status: "active" | "disabled";
  permissions: readonly PlatformPermission[];
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
