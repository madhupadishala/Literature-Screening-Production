import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { saveMedicalReview } from "@/lib/literature/review/review-mutation-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.MEDICAL_REVIEW);
    const body = await request.json();
    await saveMedicalReview({
      principal,
      workspaceId: String(body.workspaceId || ""),
      status: body.status,
      finalDecision: String(body.finalDecision || ""),
      comments: String(body.comments || ""),
      reason: String(body.reason || ""),
    });
    return Response.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
