import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGContextRequest } from "@/lib/rag/rag-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_HISTORY_VIEW);
    const body = (await request.json()) as Partial<RAGContextRequest>;
    const result = await ragEngine.buildContext({
      tenantId: principal.tenantId,
      query: String(body.query || ""),
      productName: body.productName,
      country: body.country,
      processArea: body.processArea,
      caseType: body.caseType,
      evidencePackageId: body.evidencePackageId,
      sourceTypes: body.sourceTypes,
      searchMode: body.searchMode,
      topK: body.topK,
      minScore: body.minScore,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id") || undefined,
      correlationId: request.headers.get("x-correlation-id") || undefined,
    });
    return Response.json({ success: true, data: result.context });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
