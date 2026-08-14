import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { knowledgeGraphService } from "@/lib/knowledge/graph/knowledge-graph-service";
import type { KnowledgeGraphRequest } from "@/lib/knowledge/graph/knowledge-graph-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: knowledgeGraphService.getStatus(principal.tenantId),
      graphs: knowledgeGraphService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SOURCE_MANAGE);
    const body = (await request.json()) as KnowledgeGraphRequest;
    if (!body.documentId || !Array.isArray(body.nodes)) {
      throw new Error("documentId and nodes are required.");
    }
    const graph = knowledgeGraphService.build({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ graph }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}