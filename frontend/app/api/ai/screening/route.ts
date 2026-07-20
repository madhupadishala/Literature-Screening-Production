import { NextRequest, NextResponse } from "next/server";

import { createAIRequestId } from "@/lib/ai/ai-runtime";
import { screeningService } from "@/lib/literature/screening/screening-service";
import type { ScreeningRequest } from "@/lib/literature/screening/screening-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isScreeningRequest(value: unknown): value is ScreeningRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ScreeningRequest>;

  if (!isNonEmptyString(candidate.tenantId)) {
    return false;
  }

  if (!candidate.article || typeof candidate.article !== "object") {
    return false;
  }

  return (
    isNonEmptyString(candidate.article.pmid) &&
    isNonEmptyString(candidate.article.title) &&
    (candidate.article.authors === undefined ||
      Array.isArray(candidate.article.authors))
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    createAIRequestId("correlation-screening");
  const startedAt = Date.now();

  try {
    const body: unknown = await request.json();

    if (!isScreeningRequest(body)) {
      return NextResponse.json(
        {
          success: false,
          correlationId,
          error: "Invalid screening request.",
          requiredFields: [
            "tenantId",
            "article.pmid",
            "article.title",
          ],
        },
        {
          status: 400,
          headers: {
            "x-correlation-id": correlationId,
          },
        },
      );
    }

    const normalizedRequest: ScreeningRequest = {
      ...body,
      tenantId: body.tenantId.trim(),
      correlationId,
      article: {
        ...body.article,
        pmid: body.article.pmid.trim(),
        title: body.article.title.trim(),
        abstract: body.article.abstract ?? "",
        authors: Array.isArray(body.article.authors)
          ? body.article.authors.filter(
              (author): author is string =>
                typeof author === "string" && author.trim().length > 0,
            )
          : [],
        doi: body.article.doi ?? undefined,
        journal: body.article.journal ?? undefined,
      },
    };

    const result = await screeningService.screenArticle(normalizedRequest);

    return NextResponse.json(
      {
        success: true,
        correlationId,
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        data: result,
      },
      {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
        },
      },
    );
  } catch (error) {
    console.error("[POST /api/ai/screening]", {
      correlationId,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        correlationId,
        durationMs: Date.now() - startedAt,
        error: "Screening execution failed.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown screening error.",
      },
      {
        status: 500,
        headers: {
          "x-correlation-id": correlationId,
        },
      },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      status: screeningService.getStatus(),
      history: screeningService.list(50),
    },
    { status: 200 },
  );
}
