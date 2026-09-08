import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { searchStrategyEngine } from "@/lib/literature/search/search-strategy-engine";
import type { SearchStrategyRequest } from "@/lib/literature/search/search-strategy-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );
    return NextResponse.json({
      success: true,
      status: searchStrategyEngine.getStatus(principal.tenantId),
      strategies: searchStrategyEngine.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXECUTE);
    const body = (await request.json()) as SearchStrategyRequest;
    if (
      !body.strategyName ||
      !Array.isArray(body.productNames) ||
      body.productNames.length === 0 ||
      !Array.isArray(body.inclusionTerms) ||
      body.inclusionTerms.length === 0
    ) {
      throw new Error(
        "strategyName, productNames and inclusionTerms are required.",
      );
    }

    const scopedRequest = { ...body, tenantId: principal.tenantId };
    const strategy = await searchStrategyEngine.build(scopedRequest);
    const queryParts = [
      ...body.productNames,
      ...body.inclusionTerms,
      ...(body.exclusionTerms ?? []).map((term) => `NOT ${term}`),
    ];
    const searchQuery = strategy.query.trim() || queryParts.join(" AND ");

    return NextResponse.json(
      {
        success: true,
        strategy,
        searchQuery,
        next: { endpoint: "/api/literature/pubmed/search", method: "POST" },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
