import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {leaseResponse} from "@/lib/literature/assignment/lock-service";
import { runPatientExtraction } from "@/lib/literature/review/patient-extraction-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.LITERATURE, PERMISSIONS.REVIEW_EDIT);
    const body = await request.json();
    const extraction = await runPatientExtraction({
      principal,
      workspaceId: String(body.workspaceId || ""),
      reason: String(body.reason || ""),
      lock_token: String(body.lock_token || ""),
      fencing_token: String(body.fencing_token || ""),
    });
    return Response.json({ success: true, data: { extraction } });
  } catch (error) {
    return leaseResponse(error)??routeErrorResponse(error);
  }
}
