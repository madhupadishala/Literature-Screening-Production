import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { medicalTranslationService } from "@/lib/literature/translation/medical-translation-service";
import type { MedicalTranslationRequest } from "@/lib/literature/translation/translation-types";
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
      PERMISSIONS.REVIEW_VIEW,
    );

    return Response.json({
      status: medicalTranslationService.getStatusForTenant(principal.tenantId),
      translations: medicalTranslationService.listForTenant(principal.tenantId),
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
      PERMISSIONS.REVIEW_EDIT,
    );
    const body = (await request.json()) as Partial<MedicalTranslationRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (!body.sourceText || typeof body.sourceText !== "string") {
      return Response.json(
        { error: "sourceText is required." },
        { status: 400 },
      );
    }

    const result = medicalTranslationService.translate({
      ...body,
      tenantId: principal.tenantId,
      sourceText: body.sourceText,
    } as MedicalTranslationRequest);

    return Response.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
