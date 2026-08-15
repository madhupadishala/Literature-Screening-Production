import { NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getControlledVectorStatus } from "@/lib/knowledge/retrieval/controlled-vector-status";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ragEngine } from "@/lib/rag/rag-engine";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    const vectorStatus = await getControlledVectorStatus(principal.tenantId);
    return Response.json({
      status: {
        contextsBuilt: 0,
        averageSourcesPerContext: 0,
        provider: vectorStatus.provider,
        activeRepositories: vectorStatus.activeRepositories,
        productionEligibleVectors: vectorStatus.productionEligibleVectors,
      },
      history: [],
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_HISTORY_VIEW);
    const body = await request.json() as { request?: { query?: string; topK?: number } };
    const response = await ragEngine.buildContext({
      tenantId: principal.tenantId,
      query: String(body.request?.query || ""),
      topK: body.request?.topK,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id") || undefined,
      correlationId: request.headers.get("x-correlation-id") || undefined,
    });
    return Response.json({ response }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
