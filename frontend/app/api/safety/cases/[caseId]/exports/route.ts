import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  CASE_EXPORT_FORMATS,
  generateCaseExport,
  listCaseReleaseArtifacts,
  type CaseExportFormat,
} from "@/lib/safety/case-release/case-release-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_VIEW,
    );
    const { caseId } = await context.params;
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
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_EXPORT,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as { format?: unknown };

    if (
      typeof body.format !== "string" ||
      !(CASE_EXPORT_FORMATS as readonly string[]).includes(body.format)
    ) {
      throw new Error("A supported case export format is required.");
    }

    const exported = await generateCaseExport({
      principal,
      caseId,
      format: body.format as CaseExportFormat,
    });
    return Response.json({ success: true, data: exported }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
