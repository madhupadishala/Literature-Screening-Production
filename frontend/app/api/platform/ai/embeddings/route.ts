import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { embeddingEngine } from "@/lib/platform/ai/embeddings/embedding-engine";
import type { EmbeddingRequest } from "@/lib/platform/ai/embeddings/embedding-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    return NextResponse.json({
      status: embeddingEngine.getStatus(principal.tenantId),
      history: embeddingEngine.listHistory(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SOURCE_MANAGE);
    const body = (await request.json()) as EmbeddingRequest;
    if (!body.text) throw new Error("text is required.");
    const response = await embeddingEngine.embed({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}