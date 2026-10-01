import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { evidenceNormalizationService } from "@/lib/literature/evidence-normalization/evidence-normalization-service";
import { type EvidenceSourceType, type RawEvidenceInput } from "@/lib/literature/evidence-normalization/evidence-normalization-types";
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
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }
    const body = parsed as Partial<RawEvidenceInput>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const sourceId =
      typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const content =
      typeof body.content === "string" ? body.content : "";
    const allowedSourceTypes: readonly EvidenceSourceType[] = [
      "pubmed_metadata",
      "abstract",
      "full_text_pdf",
      "html",
      "xml",
      "ocr_output",
      "translation",
      "manual_upload",
    ];
    const sourceType =
      typeof body.sourceType === "string" &&
      allowedSourceTypes.includes(body.sourceType as EvidenceSourceType)
        ? (body.sourceType as EvidenceSourceType)
        : undefined;
    const title =
      body.title === undefined
        ? undefined
        : typeof body.title === "string"
          ? body.title
          : null;
    const originalLanguage =
      body.originalLanguage === undefined
        ? undefined
        : typeof body.originalLanguage === "string"
          ? body.originalLanguage
          : null;
    const metadata =
      body.metadata === undefined
        ? undefined
        : typeof body.metadata === "object" &&
            body.metadata !== null &&
            !Array.isArray(body.metadata)
          ? body.metadata
          : null;

    if (!sourceId || !content || !sourceType || title === null || originalLanguage === null || metadata === null) {
      return Response.json(
        { error: "Invalid evidence-normalization request." },
        { status: 400 },
      );
    }

    const normalizedRequest: RawEvidenceInput = {
      tenantId: principal.tenantId,
      sourceId,
      sourceType,
      content,
      ...(title !== undefined ? { title } : {}),
      ...(originalLanguage !== undefined ? { originalLanguage } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    const result = evidenceNormalizationService.normalize(normalizedRequest);

    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
