import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { reviewRepository } from "@/lib/review/review-store";
import type { SaveReviewRequest } from "@/lib/review/review-types";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SCREENING_REVIEW,
    );
    const body = (await request.json()) as SaveReviewRequest;

    const result = reviewRepository.save({
      ...body.review,
      tenantId: principal.tenantId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return routeErrorResponse(error);
  }
}