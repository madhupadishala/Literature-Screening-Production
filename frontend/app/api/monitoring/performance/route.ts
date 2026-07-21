import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPerformanceReport } from "@/lib/enterprise/performance-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PERFORMANCE_VIEW);
    const report = await getPerformanceReport(principal.tenantId);
    return Response.json(
      { success: true, data: report },
      {
        headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
