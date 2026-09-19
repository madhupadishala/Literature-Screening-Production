import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { retryProductionHits } from "@/lib/literature/hits/production-search-to-hits-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.HITS_SUBMIT);
    const body = (await request.json()) as { packageId?: string };
    const result = await retryProductionHits({
      principal,
      packageId: body.packageId || "",
    });

    return Response.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
