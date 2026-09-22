import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listSafetyIntakes } from "@/lib/safety/common/safety-backbone-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
    const records = await listSafetyIntakes({
      principal,
      limit: Number.isFinite(rawLimit) ? rawLimit : 100,
    });

    return Response.json({
      success: true,
      data: {
        records,
        count: records.length,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
