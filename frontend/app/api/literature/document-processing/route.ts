import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { ocrService } from "@/lib/literature/document-processing/ocr-service";
import type { PDFProcessingRequest } from "@/lib/literature/document-processing/document-processing-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { assertRequestedTenantMatchesScope } from "@/lib/rbac/scoped-request";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );

    return Response.json({
      status: ocrService.getStatusForTenant(principal.tenantId),
      documents: ocrService.listForTenant(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.EVIDENCE_CREATE,
    );
    const body = (await request.json()) as Partial<PDFProcessingRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (
      !body.pmid ||
      typeof body.pmid !== "string" ||
      !body.fileName ||
      typeof body.fileName !== "string"
    ) {
      return Response.json(
        { error: "pmid and fileName are required." },
        { status: 400 },
      );
    }

    const result = await ocrService.process({
      tenantId: principal.tenantId,
      pmid: body.pmid.trim(),
      fileName: body.fileName.trim(),
    });

    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
