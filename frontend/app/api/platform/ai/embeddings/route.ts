import { NextResponse } from "next/server";
import { embeddingEngine } from "@/lib/platform/ai/embeddings/embedding-engine";
import type { EmbeddingRequest } from "@/lib/platform/ai/embeddings/embedding-types";

export async function GET() {
  return NextResponse.json({
    status: embeddingEngine.getStatus(),
    history: embeddingEngine.listHistory(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as EmbeddingRequest;

  if (!body.tenantId || !body.text) {
    return NextResponse.json(
      {
        error: "tenantId and text are required",
      },
      { status: 400 },
    );
  }

  const response = await embeddingEngine.embed(body);

  return NextResponse.json(
    {
      response,
    },
    { status: 201 },
  );
}