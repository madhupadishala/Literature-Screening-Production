import { NextRequest, NextResponse } from "next/server";

import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGContextRequest } from "@/lib/rag/rag-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RAGContextRequest;

    const result = await ragEngine.buildContext(body);

    return NextResponse.json({
      success: true,
      data: result.context,
    });
  } catch (error) {
    console.error("RAG Context Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown RAG context error",
      },
      { status: 500 },
    );
  }
}