import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { evidenceNormalizationService } from "@/lib/literature/evidence-normalization/evidence-normalization-service";
import type { RawEvidenceInput } from "@/lib/literature/evidence-normalization/evidence-normalization-types";
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
      status: evidenceNormalizationService.getStatusForTenant(principal.tenantId),
      packages: evidenceNormalizationService.listForTenant(principal.tenantId),
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
    const body = (await request.json()) as Partial<RawEvidenceInput>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (
      !body.sourceId ||
      typeof body.sourceId !== "string" ||
      !body.content ||
      typeof body.content !== "string" ||
      !body.sourceType
    ) {
      return Response.json(
        { error: "sourceId, sourceType and content are required." },
        { status: 400 },
      );
    }

    const result = evidenceNormalizationService.normalize({
      ...body,
      tenantId: principal.tenantId,
      sourceId: body.sourceId.trim(),
      content: body.content,
      sourceType: body.sourceType,
    } as RawEvidenceInput);

    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
