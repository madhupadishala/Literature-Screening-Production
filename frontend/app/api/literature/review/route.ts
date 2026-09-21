import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { listReviewWorklist } from "@/lib/literature/review/review-workflow-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.REVIEW_VIEW,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 250);
    const records = await listReviewWorklist({
      principal,
      limit: Number.isFinite(rawLimit) ? rawLimit : 250,
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
