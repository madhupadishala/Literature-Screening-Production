import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { searchControlledKnowledge } from "@/lib/knowledge/retrieval/controlled-knowledge-service";
import type { ControlledKnowledgeSearchRequest } from "@/lib/knowledge/retrieval/controlled-knowledge-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_HISTORY_VIEW);
    const body = (await request.json()) as Partial<ControlledKnowledgeSearchRequest>;
    const response = await searchControlledKnowledge({
      tenantId: principal.tenantId,
      query: String(body.query || ""),
      topK: body.topK,
      minScore: body.minScore,
      mode: body.mode,
      domains: body.domains,
      knowledgeObjectIds: body.knowledgeObjectIds,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id") || undefined,
      correlationId: request.headers.get("x-correlation-id") || undefined,
    });
    return Response.json({ success: true, data: response, results: response.results });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
