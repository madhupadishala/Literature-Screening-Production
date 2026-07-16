import { NextResponse } from "next/server";

import { knowledgeExtractionService } from "@/lib/knowledge/extraction/knowledge-extraction-service";
import type { KnowledgeExtractionRequest } from "@/lib/knowledge/extraction/knowledge-extraction-types";

export async function GET() {
  return NextResponse.json({
    status: knowledgeExtractionService.getStatus(),
    extractions: knowledgeExtractionService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as KnowledgeExtractionRequest;

  if (!body.documentId || !body.title || !body.content) {
    return NextResponse.json(
      {
        error: "documentId, title and content are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = knowledgeExtractionService.extract(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}