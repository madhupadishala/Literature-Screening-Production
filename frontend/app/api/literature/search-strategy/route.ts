import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { searchStrategyEngine } from "@/lib/literature/search/search-strategy-engine";
import type { SearchStrategyRequest } from "@/lib/literature/search/search-strategy-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { assertRequestedTenantMatchesScope } from "@/lib/rbac/scoped-request";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );

    return Response.json({
      success: true,
      status: searchStrategyEngine.getStatusForTenant(principal.tenantId),
      strategies: searchStrategyEngine.listForTenant(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.SEARCH_EXECUTE,
    );
    const body = (await request.json()) as Partial<SearchStrategyRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (
      !body.strategyName ||
      typeof body.strategyName !== "string" ||
      !Array.isArray(body.productNames) ||
      body.productNames.length === 0 ||
      !Array.isArray(body.inclusionTerms) ||
      body.inclusionTerms.length === 0
    ) {
      return Response.json(
        {
          success: false,
          error: "strategyName, productNames and inclusionTerms are required.",
        },
        { status: 400 },
      );
    }

    const normalizedRequest: SearchStrategyRequest = {
      ...body,
      tenantId: principal.tenantId,
      strategyName: body.strategyName.trim(),
      productNames: body.productNames.map(String),
      inclusionTerms: body.inclusionTerms.map(String),
      exclusionTerms: Array.isArray(body.exclusionTerms)
        ? body.exclusionTerms.map(String)
        : undefined,
    };

    const strategy = await searchStrategyEngine.build(normalizedRequest);

    const queryParts = [
      ...normalizedRequest.productNames,
      ...normalizedRequest.inclusionTerms,
      ...(normalizedRequest.exclusionTerms ?? []).map((term) => `NOT ${term}`),
    ];

    const searchQuery =
      strategy.query.trim().length > 0
        ? strategy.query
        : queryParts.join(" AND ");

    return Response.json(
      {
        success: true,
        strategy,
        searchQuery,
        next: {
          endpoint: "/api/literature/pubmed/search",
          method: "POST",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
