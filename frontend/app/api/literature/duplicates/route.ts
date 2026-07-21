import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  getDuplicateIntelligenceStatus,
  listDuplicateAssessments,
} from "@/lib/literature/duplicates/duplicate-repository";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 100);
    const [status, assessments] = await Promise.all([
      getDuplicateIntelligenceStatus(principal),
      listDuplicateAssessments({
        principal,
        limit: Number.isFinite(rawLimit) ? rawLimit : 100,
      }),
    ]);

    return Response.json({ success: true, data: { status, assessments } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
