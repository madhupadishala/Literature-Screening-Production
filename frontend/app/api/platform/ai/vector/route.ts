import { NextResponse } from "next/server";

import { vectorStore } from "@/lib/platform/vector/vector-store";
import type {
  VectorRecord,
  VectorSearchRequest,
} from "@/lib/platform/vector/vector-types";

export async function GET() {
  return NextResponse.json({
    status: vectorStore.getStatus(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as
    | VectorRecord
    | VectorSearchRequest;

  if ("queryVector" in body) {
    return NextResponse.json({
      results: vectorStore.search(body),
    });
  }

  return NextResponse.json(
    {
      record: vectorStore.upsert(body),
    },
    {
      status: 201,
    },
  );
}