import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import {
  getReviewWorkspaceDetail,
  listReviewWorklist,
} from "@/lib/literature/review/review-workflow-service";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.REVIEW_VIEW,
    );
    const workspaceId = request.nextUrl.searchParams.get("workspaceId")?.trim();
    if (workspaceId) {
      const detail = await getReviewWorkspaceDetail({ principal, workspaceId });
      return Response.json({ success: true, data: { detail } });
    }

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
