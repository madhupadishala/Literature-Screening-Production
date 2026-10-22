import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {leaseResponse} from "@/lib/literature/assignment/lock-service";
import { saveCausalityAssessments } from "@/lib/literature/review/review-mutation-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.LITERATURE, PERMISSIONS.REVIEW_EDIT);
    const body = await request.json();
    await saveCausalityAssessments({
      principal,
      workspaceId: String(body.workspaceId || ""),
      assessments: Array.isArray(body.assessments) ? body.assessments : [],
      reason: String(body.reason || ""),
      lock_token: String(body.lock_token || ""),
      fencing_token: String(body.fencing_token || ""),
    });
    return Response.json({ success: true });
  } catch (error) {
    return leaseResponse(error)??routeErrorResponse(error);
  }
}
