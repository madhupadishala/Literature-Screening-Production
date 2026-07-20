import { NextResponse } from "next/server";

import { articleFetchService } from "@/lib/literature/article-fetch/article-fetch-service";
import type { ArticleFetchRequest } from "@/lib/literature/article-fetch/article-fetch-types";

export async function GET() {
  try {
    return NextResponse.json(
      {
        success: true,
        status: articleFetchService.getStatus(),
        articles: articleFetchService.list(),
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Article Fetch GET Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve fetched articles.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ArticleFetchRequest;

    if (
      !body.tenantId ||
      typeof body.tenantId !== "string" ||
      !body.pmid ||
      typeof body.pmid !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId and pmid are required.",
        },
        {
          status: 400,
        },
      );
    }

    const article = await articleFetchService.fetch({
      ...body,
      tenantId: body.tenantId.trim(),
      pmid: body.pmid.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        tenantId: body.tenantId,
        pmid: body.pmid,
        article,
        next: {
          endpoint: "/api/evidence/package",
          method: "POST",
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Article Fetch Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch article.",
      },
      {
        status: 500,
      },
    );
  }
}