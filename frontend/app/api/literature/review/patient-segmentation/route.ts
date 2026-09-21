import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { savePatientSegmentation } from "@/lib/literature/review/review-mutation-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.REVIEW_EDIT);
    const body = await request.json();
    await savePatientSegmentation({
      principal,
      workspaceId: String(body.workspaceId || ""),
      patients: Array.isArray(body.patients) ? body.patients : [],
      reason: String(body.reason || ""),
    });
    return Response.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
