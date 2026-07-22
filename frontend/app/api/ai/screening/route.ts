import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { createAIRequestId } from "@/lib/ai/ai-runtime";
import { screeningService } from "@/lib/literature/screening/screening-service";
import type { ScreeningRequest } from "@/lib/literature/screening/screening-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validArticle(value: unknown): value is ScreeningRequest["article"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const article = value as Partial<ScreeningRequest["article"]>;
  return nonEmpty(article.pmid) && nonEmpty(article.title);
}

export async function POST(request: NextRequest): Promise<Response> {
  const correlationId =
    request.headers.get("x-correlation-id") ||
    request.headers.get("x-request-id") ||
    createAIRequestId("correlation-screening");

  try {
    const principal = await requirePermission(request, PERMISSIONS.SCREENING_EXECUTE);
    const body = (await request.json()) as { article?: unknown };
    if (!validArticle(body.article)) {
      return Response.json(
        { success: false, correlationId, error: "Valid article.pmid and article.title are required." },
        { status: 400, headers: { "x-correlation-id": correlationId } },
      );
    }

    const article = body.article;
    const normalized: ScreeningRequest = {
      tenantId: principal.tenantId,
      correlationId,
      article: {
        ...article,
        pmid: article.pmid.trim(),
        title: article.title.trim(),
        abstract: article.abstract || "",
        authors: Array.isArray(article.authors)
          ? article.authors.filter(nonEmpty).map((author) => author.trim())
          : [],
      },
    };
    const result = await screeningService.screenArticle(normalized);
    return Response.json(
      { success: true, correlationId, processedAt: new Date().toISOString(), data: result },
      { status: 200, headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, PERMISSIONS.SCREENING_REVIEW);
    return Response.json({ success: true, status: screeningService.getStatus(), history: screeningService.list(50) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
