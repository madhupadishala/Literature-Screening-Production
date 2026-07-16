import { NextResponse } from "next/server";

import { articleFetchService } from "@/lib/literature/article-fetch/article-fetch-service";
import type { ArticleFetchRequest } from "@/lib/literature/article-fetch/article-fetch-types";

export async function GET() {
  return NextResponse.json({
    status: articleFetchService.getStatus(),
    articles: articleFetchService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as ArticleFetchRequest;

  if (!body.tenantId || !body.pmid) {
    return NextResponse.json(
      {
        error: "tenantId and pmid are required.",
      },
      {
        status: 400,
      },
    );
  }

  const article = await articleFetchService.fetch(body);

  return NextResponse.json(
    {
      article,
    },
    {
      status: 201,
    },
  );
}