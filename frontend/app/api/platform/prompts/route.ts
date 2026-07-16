import { NextResponse } from "next/server";

import { promptManager } from "@/lib/platform/prompts/prompt-manager";
import type {
  PromptRequest,
  PromptTemplate,
} from "@/lib/platform/prompts/prompt-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const category = searchParams.get("category");
  const tenantId = searchParams.get("tenantId") ?? undefined;

  if (category) {
    const prompt = promptManager.getPrompt({
      category: category as PromptRequest["category"],
      tenantId,
    });

    return NextResponse.json({
      prompt,
    });
  }

  return NextResponse.json({
    status: promptManager.getStatus(),
    prompts: promptManager.listPrompts(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as PromptTemplate;

  if (!body.id || !body.name || !body.category || !body.version) {
    return NextResponse.json(
      {
        error: "id, name, category and version are required",
      },
      {
        status: 400,
      },
    );
  }

  const prompt = promptManager.registerPrompt({
    ...body,
    createdAt: body.createdAt ?? new Date().toISOString(),
  });

  return NextResponse.json(
    {
      prompt,
    },
    {
      status: 201,
    },
  );
}