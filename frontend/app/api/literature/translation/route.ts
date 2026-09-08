import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { medicalTranslationService } from "@/lib/literature/translation/medical-translation-service";
import type { MedicalTranslationRequest } from "@/lib/literature/translation/translation-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    return NextResponse.json({
      status: medicalTranslationService.getStatus(principal.tenantId),
      translations: medicalTranslationService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXECUTE);
    const body = (await request.json()) as MedicalTranslationRequest;
    if (!body.sourceText) throw new Error("sourceText is required.");
    const result = medicalTranslationService.translate({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}