import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { saveMedicalReview } from "@/lib/literature/review/review-assessment-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.MEDICAL_REVIEW);
    const { workspaceId } = await context.params;
    const body = await request.json();
    const detail = await saveMedicalReview({
      principal,
      workspaceId,
      review: {
        decision: body?.decision,
        comments: body?.comments,
        unresolvedAcknowledged: body?.unresolvedAcknowledged === true,
      },
    });
    return Response.json({ success: true, data: detail });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
