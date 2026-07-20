import { NextResponse } from "next/server";

import { pubMedService } from "@/lib/literature/pubmed/pubmed-service";
import type { PubMedSearchRequest } from "@/lib/literature/pubmed/pubmed-types";

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      status: pubMedService.getStatus(),
      searches: pubMedService.list(),
    },
    {
      status: 200,
    },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PubMedSearchRequest;

    if (
      !body.tenantId ||
      typeof body.tenantId !== "string" ||
      !body.query ||
      typeof body.query !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId and query are required.",
        },
        {
          status: 400,
        },
      );
    }

    const result = await pubMedService.search({
      ...body,
      query: body.query.trim(),
    });

    // Cast to any for the fallback properties to keep the build green 
    // while preserving the original developer's defensive checks.
    const articles =
      result?.articles ??
      (result as any)?.records ??
      (result as any)?.results ??
      [];

    return NextResponse.json(
      {
        success: true,
        tenantId: body.tenantId,
        query: body.query,
        totalArticles: articles.length,
        result,
        next: {
          endpoint: "/api/literature/global-sources",
          method: "POST",
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("PubMed Search Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute PubMed search.",
      },
      {
        status: 500,
      },
    );
  }
}