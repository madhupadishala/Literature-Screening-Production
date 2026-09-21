import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { runPatientExtraction } from "@/lib/literature/review/patient-extraction-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.REVIEW_EDIT);
    const body = await request.json();
    const extraction = await runPatientExtraction({
      principal,
      workspaceId: String(body.workspaceId || ""),
      reason: String(body.reason || ""),
    });
    return Response.json({ success: true, data: { extraction } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
