import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { articleFetchService } from "@/lib/literature/article-fetch/article-fetch-service";
import type { ArticleFetchRequest } from "@/lib/literature/article-fetch/article-fetch-types";
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
      status: articleFetchService.getStatus(principal.tenantId),
      articles: articleFetchService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXECUTE);
    const body = (await request.json()) as ArticleFetchRequest;
    if (!body.pmid || typeof body.pmid !== "string") {
      throw new Error("pmid is required.");
    }

    const pmid = body.pmid.trim();
    const article = await articleFetchService.fetch({
      ...body,
      tenantId: principal.tenantId,
      pmid,
    });

    return NextResponse.json({
      success: true,
      tenantId: principal.tenantId,
      pmid,
      article,
      next: { endpoint: "/api/evidence/package", method: "POST" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}