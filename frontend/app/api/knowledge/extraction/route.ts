import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { knowledgeExtractionService } from "@/lib/knowledge/extraction/knowledge-extraction-service";
import type { KnowledgeExtractionRequest } from "@/lib/knowledge/extraction/knowledge-extraction-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: knowledgeExtractionService.getStatus(principal.tenantId),
      extractions: knowledgeExtractionService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SOURCE_MANAGE);
    const body = (await request.json()) as KnowledgeExtractionRequest;
    if (!body.documentId || !body.title || !body.content) {
      throw new Error("documentId, title and content are required.");
    }
    const result = knowledgeExtractionService.extract({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}