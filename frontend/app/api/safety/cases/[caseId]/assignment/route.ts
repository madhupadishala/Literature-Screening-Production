import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { assignCase } from "@/lib/safety/case-processing/case-processing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_ASSIGN,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as {
      assignedTo?: unknown;
      changeReason?: unknown;
    };
    if (typeof body.changeReason !== "string") {
      throw new Error("changeReason is required.");
    }
    const assignedTo =
      body.assignedTo === "SELF"
        ? principal.userId
        : body.assignedTo === null
          ? null
          : typeof body.assignedTo === "string"
            ? body.assignedTo
            : principal.userId;

    const workspace = await assignCase({
      principal,
      caseId,
      assignedTo,
      changeReason: body.changeReason,
    });
    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
