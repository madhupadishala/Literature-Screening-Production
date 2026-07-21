import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { successResponse } from "@/lib/enterprise/api-response";
import { getMonitoringSummary } from "@/lib/enterprise/monitoring-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    const summary = await getMonitoringSummary(principal.tenantId);
    return successResponse(summary);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
