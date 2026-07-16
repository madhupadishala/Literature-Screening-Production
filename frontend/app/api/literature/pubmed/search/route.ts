import { NextResponse } from "next/server";

import { pubMedService } from "@/lib/literature/pubmed/pubmed-service";
import type { PubMedSearchRequest } from "@/lib/literature/pubmed/pubmed-types";

export async function GET() {
  return NextResponse.json({
    status: pubMedService.getStatus(),
    searches: pubMedService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as PubMedSearchRequest;

  if (!body.tenantId || !body.query) {
    return NextResponse.json(
      {
        error: "tenantId and query are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await pubMedService.search(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}