import type { NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";
import { requirePlatformPermission } from "@/lib/rbac/guard";
import { PLATFORM_PERMISSIONS } from "@/lib/nexus/platform-permissions";
import { getPostgresPool } from "@/lib/database/postgres";
import { getTenantConfiguration, tenantSettingsSchema } from "@/lib/tenant/tenant-configuration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const principal = await resolveRequestPrincipal(request);
    const tenant = await getTenantConfiguration(principal.tenantId, principal.environment);
    return Response.json({ tenants: [tenant], activeTenantId: principal.tenantId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return routeErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const principal = await requirePlatformPermission(request, PLATFORM_PERMISSIONS.TENANT_MANAGE);
    const body = await request.json().catch(() => null);
    if (!body?.tenant || body.tenant.id !== principal.tenantId) {
      return Response.json({ error: "Configuration must belong to the selected tenant." }, { status: 403 });
    }
    const parsed = tenantSettingsSchema.safeParse(body.tenant);
    if (!parsed.success) return Response.json({ error: "Invalid tenant configuration." }, { status: 400 });
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(`UPDATE tenants
        SET configuration = jsonb_set(configuration, '{tenantUi}', $2::jsonb), updated_at = now()
        WHERE id = $1 AND status = 'active' RETURNING id`, [principal.tenantId, JSON.stringify(parsed.data)]);
      if (!updated.rows[0]) throw Object.assign(new Error("Tenant not found."), { statusCode: 404 });
      await client.query(`INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category, outcome, details)
        VALUES ($1, $2, 'TENANT_CONFIGURATION_UPDATED', 'SECURITY_RBAC', 'success', $3::jsonb)`,
        [principal.tenantId, principal.userId, JSON.stringify({ environment: principal.environment })]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    return Response.json({ success: true });
  } catch (error) { return routeErrorResponse(error); }
}
// Tenant creation, deletion and context switching belong to the Nexus administration/context APIs.
