import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { saveMedicalReview } from "@/lib/literature/review/review-mutation-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.LITERATURE, PERMISSIONS.MEDICAL_REVIEW);
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
