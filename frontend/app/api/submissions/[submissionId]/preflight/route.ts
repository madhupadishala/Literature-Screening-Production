import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { runSubmissionPreflight } from "@/lib/submissions/submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ submissionId: string }> }) {
  try {
    const principal = await requireWorkspaceModulePermission(
      request, NEXUS_MODULES.SUBMISSIONS, PERMISSIONS.SUBMISSION_CREATE,
    );
    const { submissionId } = await context.params;
    return Response.json({ success: true, data: await runSubmissionPreflight({ principal, submissionId }) });
  } catch (error) { return routeErrorResponse(error); }
}
