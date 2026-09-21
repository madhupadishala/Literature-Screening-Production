import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { roleHasPermission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { runSprint6CAutonomousValidation } from "@/lib/validation/sprint6c-autonomous-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY PRODUCTION ONE-SHOT ROUTE.
 * Synthetic Sprint 6C validation only.
 * Must be removed immediately after one execution.
 */
async function validationPrincipal(): Promise<RequestPrincipal> {
  const result = await getPostgresPool().query<{
    tenant_id: string;
    tenant_key: string;
    user_id: string;
    email: string;
    display_name: string;
    role_key: string;
    permissions: unknown;
  }>(
    `SELECT
       tenant.id AS tenant_id,
       tenant.tenant_key,
       users.id AS user_id,
       users.email,
       users.display_name,
       membership.role_key,
       membership.permissions
     FROM tenants tenant
     JOIN tenant_memberships membership ON membership.tenant_id = tenant.id
     JOIN application_users users ON users.id = membership.user_id
     WHERE tenant.tenant_key = 'clinixai-prod'
       AND tenant.status = 'active'
       AND users.status = 'active'
       AND membership.membership_status = 'active'
       AND membership.role_key = 'CLINIXAI_SUPER_ADMIN'
     ORDER BY membership.created_at
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("No active ClinixAI Super Admin is available for validation automation.");

  const customPermissions = Array.isArray(row.permissions)
    ? row.permissions.map(String)
    : [];

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    roleKey: row.role_key,
    customPermissions,
    hasPermission: (permission) =>
      roleHasPermission(row.role_key, permission, customPermissions),
  };
}

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const principal = await validationPrincipal();
    const pool = getPostgresPool();

    const alreadyRun = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_events
       WHERE tenant_id = $1
         AND event_type IN (
           'SPRINT_6C_AUTONOMOUS_VALIDATION_PASSED',
           'SPRINT_6C_PRODUCTION_ONESHOT_INVOKED'
         )`,
      [principal.tenantId],
    );
    if (Number(alreadyRun.rows[0]?.count || 0) > 0) {
      throw new Error("Sprint 6C one-shot validation has already been invoked.");
    }

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SPRINT_6C_PRODUCTION_ONESHOT_INVOKED',
         'LITERATURE_VALIDATION','started',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({
          syntheticValidationOnly: true,
          oneShot: true,
          ownerAuthorized: true,
          productionHumanGatesUnchanged: true,
        }),
      ],
    );

    const report = await runSprint6CAutonomousValidation({ principal });
    return Response.json(
      { success: true, data: { report } },
      { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
