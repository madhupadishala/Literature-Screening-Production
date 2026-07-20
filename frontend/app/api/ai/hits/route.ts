import { NextRequest, NextResponse } from "next/server";

import { createAIRequestId } from "@/lib/ai/ai-runtime";
import {
  hitsAgent,
  type HitsAgentRequest,
} from "@/lib/ai/hits-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHitsAgentRequest(value: unknown): value is HitsAgentRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<HitsAgentRequest>;
  return isNonEmptyString(candidate.tenantId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    createAIRequestId("correlation-hits");
  const startedAt = Date.now();

  try {
    const body: unknown = await request.json();

    if (!isHitsAgentRequest(body)) {
      return NextResponse.json(
        {
          success: false,
          correlationId,
          error: "Invalid Hits AI request.",
          requiredFields: ["tenantId"],
        },
        {
          status: 400,
          headers: {
            "x-correlation-id": correlationId,
          },
        },
      );
    }

    const result = await hitsAgent.evaluate({
      ...body,
      tenantId: body.tenantId.trim(),
      correlationId,
    });

    return NextResponse.json(
      {
        success: true,
        correlationId,
        stage: "HITS",
        processedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        data: result,
        next: {
          endpoint: "/api/workflow/run",
          method: "POST",
        },
      },
      {
        status: 200,
        headers: {
          "x-correlation-id": correlationId,
        },
      },
    );
  } catch (error) {
    console.error("[POST /api/ai/hits]", {
      correlationId,
      error,
    });

    return NextResponse.json(
      {
        success: false,
        correlationId,
        durationMs: Date.now() - startedAt,
        error: "Hits AI execution failed.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown Hits AI error.",
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
