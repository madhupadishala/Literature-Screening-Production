import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { createAIRequestId } from "@/lib/ai/ai-runtime";
import { hitsAgent, type HitsAgentRequest } from "@/lib/ai/hits-agent";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HitsBody = Omit<HitsAgentRequest, "tenantId" | "correlationId">;

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId =
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    createAIRequestId("correlation-hits");
  const startedAt = Date.now();

  try {
    const principal = await requirePermission(request, PERMISSIONS.HITS_SUBMIT);
    const body = (await request.json()) as HitsBody;
    const result = await hitsAgent.evaluate({
      tenantId: principal.tenantId,
      articleId: body.articleId,
      articleTitle: body.articleTitle,
      abstractText: body.abstractText,
      fullTextSnippet: body.fullTextSnippet,
      productName: body.productName,
      country: body.country,
      processArea: body.processArea,
      correlationId,
    });

    return Response.json(
      {
        success: true,
        correlationId,
        stage: "HITS",
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        data: result,
        next: { endpoint: "/api/workflow/run", method: "POST" },
      },
      { status: 200, headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
