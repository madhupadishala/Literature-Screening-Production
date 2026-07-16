import { NextResponse } from "next/server";

import { searchStrategyEngine } from "@/lib/literature/search/search-strategy-engine";
import type { SearchStrategyRequest } from "@/lib/literature/search/search-strategy-types";

export async function GET() {
  return NextResponse.json({
    status: searchStrategyEngine.getStatus(),
    strategies: searchStrategyEngine.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as SearchStrategyRequest;

  if (
    !body.tenantId ||
    !body.strategyName ||
    body.productNames.length === 0 ||
    body.inclusionTerms.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "tenantId, strategyName, productNames and inclusionTerms are required.",
      },
      {
        status: 400,
      },
    );
  }

  const strategy = searchStrategyEngine.build(body);

  return NextResponse.json(
    {
      strategy,
    },
    {
      status: 201,
    },
  );
}