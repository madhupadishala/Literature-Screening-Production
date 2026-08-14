import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { evidenceNormalizationService } from "@/lib/literature/evidence-normalization/evidence-normalization-service";
import type { RawEvidenceInput } from "@/lib/literature/evidence-normalization/evidence-normalization-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    return NextResponse.json({
      status: evidenceNormalizationService.getStatus(principal.tenantId),
      packages: evidenceNormalizationService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.EVIDENCE_CREATE);
    const body = (await request.json()) as RawEvidenceInput;
    if (!body.sourceId || !body.content) {
      throw new Error("sourceId and content are required.");
    }
    const result = evidenceNormalizationService.normalize({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}