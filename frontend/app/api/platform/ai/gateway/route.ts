import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { aiGateway } from "@/lib/platform/ai/gateway/ai-gateway";
import type { AICompletionRequest } from "@/lib/platform/ai/gateway/ai-gateway-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.PERFORMANCE_VIEW);
    return NextResponse.json({
      status: aiGateway.getStatus(principal.tenantId),
      history: aiGateway.listHistory(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXECUTE);
    const body = (await request.json()) as AICompletionRequest;
    if (!body.useCase || !Array.isArray(body.messages)) {
      throw new Error("useCase and messages are required.");
    }
    const response = await aiGateway.complete({
      ...body,
      tenantId: principal.tenantId,
    });
    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}