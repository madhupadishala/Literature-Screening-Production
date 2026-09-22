import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getTenantEntitlements } from "@/lib/nexus/entitlement-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tenant-facing, read-only entitlement view.
 * Commercial activation/deactivation belongs to the separate platform control plane.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ENTITLEMENT_VIEW);
    const entitlements = await getTenantEntitlements(
      principal.tenantId,
      principal.environment,
    );

    return Response.json({
      success: true,
      data: {
        tenantKey: principal.tenantKey,
        environment: principal.environment,
        entitlements,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
