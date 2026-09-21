import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { roleHasPermission } from "@/lib/rbac/permissions";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { runSprint6CAutonomousValidation } from "@/lib/validation/sprint6c-autonomous-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function validateOneTimeToken(token: string): Promise<{
  tenantId: string;
  tokenSha256: string;
}> {
  if (token.length < 32) throw new Error("Invalid autonomous validation token.");
  const tokenSha256 = sha256(token);
  const pool = getPostgresPool();

  const issued = await pool.query<{
    tenant_id: string;
    created_at: Date;
    token_sha256: string;
  }>(
    `SELECT tenant_id, created_at,
            details->>'tokenSha256' AS token_sha256
     FROM audit_events
     WHERE event_type = 'SPRINT_6C_AUTORUN_TOKEN_ISSUED'
       AND details->>'tokenSha256' = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenSha256],
  );
  const row = issued.rows[0];
  if (!row || !secureEqual(row.token_sha256, tokenSha256)) {
    throw new Error("Autonomous validation token was not issued.");
  }
  if (Date.now() - row.created_at.getTime() > 60 * 60 * 1000) {
    throw new Error("Autonomous validation token has expired.");
  }

  const consumed = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM audit_events
     WHERE event_type = 'SPRINT_6C_AUTORUN_TOKEN_CONSUMED'
       AND details->>'tokenSha256' = $1`,
    [tokenSha256],
  );
  if (Number(consumed.rows[0]?.count || 0) > 0) {
    throw new Error("Autonomous validation token has already been consumed.");
  }

  return { tenantId: row.tenant_id, tokenSha256 };
}

async function automationPrincipal(tenantId: string): Promise<RequestPrincipal> {
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
     WHERE tenant.id = $1
       AND tenant.status = 'active'
       AND users.status = 'active'
       AND membership.membership_status = 'active'
       AND membership.role_key = 'CLINIXAI_SUPER_ADMIN'
     ORDER BY membership.created_at
     LIMIT 1`,
    [tenantId],
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

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    const validated = await validateOneTimeToken(token);
    const principal = await automationPrincipal(validated.tenantId);
    const pool = getPostgresPool();

    await pool.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SPRINT_6C_AUTORUN_TOKEN_CONSUMED',
         'LITERATURE_VALIDATION','consumed',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({
          tokenSha256: validated.tokenSha256,
          syntheticValidationOnly: true,
          requestedExecution: "SPRINT_6C_AUTONOMOUS_VALIDATION",
        }),
      ],
    );

    try {
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
      await pool.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, details
         ) VALUES ($1,$2,'SPRINT_6C_AUTONOMOUS_VALIDATION_FAILED',
           'LITERATURE_VALIDATION','failure',$3::jsonb)`,
        [
          principal.tenantId,
          principal.userId,
          JSON.stringify({
            tokenSha256: validated.tokenSha256,
            error: error instanceof Error ? error.message : String(error),
            syntheticValidationOnly: true,
          }),
        ],
      );
      throw error;
    }
  } catch (error) {
    return routeErrorResponse(error);
  }
}
