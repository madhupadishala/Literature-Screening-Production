import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { getSubmissionPackage } from "@/lib/submissions/submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SUBMISSIONS,
      PERMISSIONS.SUBMISSION_VIEW,
    );
    const { submissionId } = await context.params;
    const submission = await getSubmissionPackage({ principal, submissionId });
    return Response.json({ success: true, data: submission });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
