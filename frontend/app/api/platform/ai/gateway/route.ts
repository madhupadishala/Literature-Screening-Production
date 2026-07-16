import { NextResponse } from "next/server";
import { aiGateway } from "@/lib/platform/ai/gateway/ai-gateway";
import type { AICompletionRequest } from "@/lib/platform/ai/gateway/ai-gateway-types";

export async function GET() {
  return NextResponse.json({
    status: aiGateway.getStatus(),
    history: aiGateway.listHistory(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as AICompletionRequest;

  if (!body.tenantId || !body.useCase || !Array.isArray(body.messages)) {
    return NextResponse.json(
      {
        error: "tenantId, useCase and messages are required",
      },
      { status: 400 },
    );
  }

  const response = await aiGateway.complete(body);

  return NextResponse.json(
    {
      response,
    },
    { status: 201 },
  );
}