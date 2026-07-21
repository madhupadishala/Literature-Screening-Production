import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { successResponse } from "@/lib/enterprise/api-response";
import { registerDefaultDependencyProbes } from "@/lib/enterprise/dependency-probes";
import { healthRegistry } from "@/lib/enterprise/health-registry";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    registerDefaultDependencyProbes();
    const report = await healthRegistry.run();
    return successResponse(
      {
        status: report.status,
        checkedAt: report.checkedAt,
        checks: report.checks,
      },
      report.status === "unhealthy" ? 503 : 200,
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
