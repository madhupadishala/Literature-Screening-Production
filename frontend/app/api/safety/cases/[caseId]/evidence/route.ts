import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { assertSafetyCaseInScope } from "@/lib/safety/common/safety-workspace-scope";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  generateCaseEvidencePackage,
  listCaseReleaseArtifacts,
} from "@/lib/safety/case-release/case-release-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_VIEW,
    );
    const { caseId } = await context.params;
    await assertSafetyCaseInScope(principal, caseId);
    const artifacts = await listCaseReleaseArtifacts({ principal, caseId });
    return Response.json({ success: true, data: artifacts });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_EXPORT,
    );
    const { caseId } = await context.params;
    await assertSafetyCaseInScope(principal, caseId);
    const evidencePackage = await generateCaseEvidencePackage({
      principal,
      caseId,
    });
    return Response.json(
      { success: true, data: evidencePackage },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
