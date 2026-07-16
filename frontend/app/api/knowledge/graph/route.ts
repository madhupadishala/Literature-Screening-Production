import { NextResponse } from "next/server";

import { knowledgeGraphService } from "@/lib/knowledge/graph/knowledge-graph-service";
import type { KnowledgeGraphRequest } from "@/lib/knowledge/graph/knowledge-graph-types";

export async function GET() {
  return NextResponse.json({
    status: knowledgeGraphService.getStatus(),
    graphs: knowledgeGraphService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as KnowledgeGraphRequest;

  if (!body.documentId || !Array.isArray(body.nodes)) {
    return NextResponse.json(
      {
        error: "documentId and nodes are required.",
      },
      {
        status: 400,
      },
    );
  }

  const graph = knowledgeGraphService.build(body);

  return NextResponse.json(
    {
      graph,
    },
    {
      status: 201,
    },
  );
}