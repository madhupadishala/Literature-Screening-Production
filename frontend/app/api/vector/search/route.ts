import { NextRequest, NextResponse } from "next/server";

import { vectorStore } from "@/lib/vector/vector-store";
import type { VectorSearchRequest } from "@/lib/vector/vector-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VectorSearchRequest;

    const result = await vectorStore.search(body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Vector Search Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown vector search error",
      },
      { status: 500 }
    );
  }
}