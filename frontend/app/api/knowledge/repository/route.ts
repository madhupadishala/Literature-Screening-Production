import { NextResponse } from "next/server";

import { knowledgeStore } from "@/lib/knowledge/repository/knowledge-store";
import type { CreateKnowledgeDocumentInput } from "@/lib/knowledge/repository/knowledge-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const tenantId = searchParams.get("tenantId") ?? undefined;

  return NextResponse.json({
    status: knowledgeStore.getStatus(),
    documents: knowledgeStore.list(tenantId),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateKnowledgeDocumentInput;

  if (
    !body.title ||
    !body.category ||
    !body.version ||
    !body.content
  ) {
    return NextResponse.json(
      {
        error:
          "title, category, version and content are required.",
      },
      {
        status: 400,
      },
    );
  }

  const document = knowledgeStore.create(body);

  return NextResponse.json(
    {
      document,
    },
    {
      status: 201,
    },
  );
}