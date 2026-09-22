import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { listHitsForReview } from "@/lib/literature/hits/hits-review-repository";
import type { HitsReviewStatus } from "@/lib/literature/hits/hits-review-types";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reviewStatus(value: string | null): HitsReviewStatus | undefined {
  return value && ["pending", "approved", "dismissed", "flagged"].includes(value)
    ? (value as HitsReviewStatus)
    : undefined;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 250);
    const hits = await listHitsForReview({
      principal,
      status: reviewStatus(request.nextUrl.searchParams.get("status")),
      limit: Number.isFinite(rawLimit) ? rawLimit : 250,
    });

    return Response.json({
      success: true,
      data: { hits, count: hits.length },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
