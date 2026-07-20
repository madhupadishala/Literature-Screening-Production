import { NextResponse } from "next/server";

import { searchStrategyEngine } from "@/lib/literature/search/search-strategy-engine";
import type { SearchStrategyRequest } from "@/lib/literature/search/search-strategy-types";

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      status: searchStrategyEngine.getStatus(),
      strategies: searchStrategyEngine.list(),
    },
    {
      status: 200,
    },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchStrategyRequest;

    if (
      !body.tenantId ||
      !body.strategyName ||
      !Array.isArray(body.productNames) ||
      body.productNames.length === 0 ||
      !Array.isArray(body.inclusionTerms) ||
      body.inclusionTerms.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "tenantId, strategyName, productNames and inclusionTerms are required.",
        },
        {
          status: 400,
        },
      );
    }

    const strategy = searchStrategyEngine.build(body);

    const queryParts = [
      ...body.productNames,
      ...body.inclusionTerms,
      ...(body.exclusionTerms ?? []).map((term) => `NOT ${term}`),
    ];

    // Cast to any to safely allow the check for dynamic or custom searchQuery properties
    const strategyAny = strategy as any;
    const searchQuery =
      strategyAny.searchQuery && strategyAny.searchQuery.trim().length > 0
        ? strategyAny.searchQuery
        : queryParts.join(" AND ");

    return NextResponse.json(
      {
        success: true,
        strategy,
        searchQuery,
        next: {
          endpoint: "/api/literature/pubmed/search",
          method: "POST",
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Search Strategy Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate search strategy.",
      },
      {
        status: 500,
      },
    );
  }
}