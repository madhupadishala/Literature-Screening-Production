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
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { success: false, error: "A JSON object body is required." },
        { status: 400 },
      );
    }
    const body = parsed as Partial<PubMedSearchRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return Response.json(
        { success: false, error: "query is required." },
        { status: 400 },
      );
    }
    if (
      body.maxResults !== undefined &&
      (typeof body.maxResults !== "number" ||
        !Number.isFinite(body.maxResults) ||
        body.maxResults < 1)
    ) {
      return Response.json(
        { success: false, error: "maxResults must be a positive finite number." },
        { status: 400 },
      );
    }
    for (const [label, value] of [
      ["includeAbstract", body.includeAbstract],
      ["includeMetadata", body.includeMetadata],
      ["includeFullTextLinks", body.includeFullTextLinks],
    ] as const) {
      if (value !== undefined && typeof value !== "boolean") {
        return Response.json(
          { success: false, error: `${label} must be boolean.` },
          { status: 400 },
        );
      }
    }

    const result = await pubMedService.search({
      tenantId: principal.tenantId,
      query,
      ...(body.maxResults !== undefined
        ? { maxResults: Math.min(Math.trunc(body.maxResults), 200) }
        : {}),
      ...(body.includeAbstract !== undefined
        ? { includeAbstract: body.includeAbstract }
        : {}),
      ...(body.includeMetadata !== undefined
        ? { includeMetadata: body.includeMetadata }
        : {}),
      ...(body.includeFullTextLinks !== undefined
        ? { includeFullTextLinks: body.includeFullTextLinks }
        : {}),
    });

    const articles = result.articles;

    return Response.json({
      success: true,
      tenantId: principal.tenantId,
      query,
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
