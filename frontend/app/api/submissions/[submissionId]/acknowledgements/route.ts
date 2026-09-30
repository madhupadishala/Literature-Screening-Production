import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { recordSubmissionAcknowledgement } from "@/lib/submissions/submission-service";
import type { RecordAcknowledgementRequest } from "@/lib/submissions/submission-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SUBMISSIONS,
      PERMISSIONS.SUBMISSION_ACKNOWLEDGE,
    );
    const { submissionId } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid acknowledgement request body.");
    }
    const acknowledgement = await recordSubmissionAcknowledgement({
      principal,
      submissionId,
      request: body as RecordAcknowledgementRequest,
    });
    return Response.json(
      { success: true, data: acknowledgement },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
