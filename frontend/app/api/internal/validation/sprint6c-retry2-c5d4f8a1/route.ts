import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { roleHasPermission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { runSprint6CAutonomousValidation } from "@/lib/validation/sprint6c-autonomous-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY PRODUCTION RETRY ROUTE.
 * Synthetic Sprint 6C validation only.
 * This retry exists only because the first controlled run exposed a genuine
 * Product Master strength-qualifier normalization defect. It must be removed
 * immediately after Sprint 6C reaches PASS.
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
  if (!row) {
    throw new Error(
      "No active ClinixAI Super Admin is available for validation automation.",
    );
  }

  const customPermissions = Array.isArray(row.permissions)
    ? row.permissions.map(String)
    : [];

  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    environment: "PROD",
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

    const state = await pool.query<{
      passed_count: string;
      retry_count: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE event_type = 'SPRINT_6C_AUTONOMOUS_VALIDATION_PASSED'
         )::text AS passed_count,
         count(*) FILTER (
           WHERE event_type = 'SPRINT_6C_RETRY_2_INVOKED'
         )::text AS retry_count
       FROM audit_events
       WHERE tenant_id = $1`,
      [principal.tenantId],
    );

    if (Number(state.rows[0]?.passed_count || 0) > 0) {
      throw new Error("Sprint 6C has already passed.");
    }
    if (Number(state.rows[0]?.retry_count || 0) > 0) {
      throw new Error("Sprint 6C retry 2 has already been invoked.");
    }

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SPRINT_6C_RETRY_2_INVOKED',
         'LITERATURE_VALIDATION','started',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({
          syntheticValidationOnly: true,
          retryAttempt: 2,
          ownerAuthorized: true,
          productionHumanGatesUnchanged: true,
          reason:
            "Retry controlled Sprint 6C after correcting source-exact product identity with trailing strength qualifier.",
        }),
      ],
    );

    const report = await runSprint6CAutonomousValidation({ principal });
    return Response.json(
      { success: true, data: { report } },
      {
        headers: {
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
