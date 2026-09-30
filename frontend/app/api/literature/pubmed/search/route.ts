import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { pubMedService } from "@/lib/literature/pubmed/pubmed-service";
import type { PubMedSearchRequest } from "@/lib/literature/pubmed/pubmed-types";
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
      status: pubMedService.getStatusForTenant(principal.tenantId),
      searches: pubMedService.listForTenant(principal.tenantId),
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
    const body = (await request.json()) as Partial<PubMedSearchRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { success: false, error: "query is required." },
        { status: 400 },
      );
    }

    const result = await pubMedService.search({
      ...body,
      tenantId: principal.tenantId,
      query: body.query.trim(),
    } as PubMedSearchRequest);

    const articles = result.articles;

    return Response.json({
      success: true,
      tenantId: principal.tenantId,
      query: body.query.trim(),
      totalArticles: articles.length,
      result,
      next: {
        endpoint: "/api/literature/global-sources",
        method: "POST",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
