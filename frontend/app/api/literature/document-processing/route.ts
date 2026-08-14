import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import type { PDFProcessingRequest } from "@/lib/literature/document-processing/document-processing-types";
import { ocrService } from "@/lib/literature/document-processing/ocr-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    return NextResponse.json({
      status: ocrService.getStatus(principal.tenantId),
      documents: ocrService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.EVIDENCE_CREATE);
    const body = (await request.json()) as PDFProcessingRequest;
    if (!body.pmid || !body.fileName) {
      throw new Error("pmid and fileName are required.");
    }
    const result = await ocrService.process({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}