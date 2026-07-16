import { NextResponse } from "next/server";

import { enterpriseRAG } from "@/lib/platform/rag/rag-engine";
import type {
  RAGRequest,
  RAGSource,
} from "@/lib/platform/rag/rag-types";

export async function GET() {
  return NextResponse.json({
    status: enterpriseRAG.getStatus(),
    history: enterpriseRAG.listHistory(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    request: RAGRequest;
    sources?: RAGSource[];
  };

  const response = enterpriseRAG.buildContext(
    body.request,
    body.sources ?? [],
  );

  return NextResponse.json(
    {
      response,
    },
    {
      status: 201,
    },
  );
}