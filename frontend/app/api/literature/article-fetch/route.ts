import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { articleFetchService } from "@/lib/literature/article-fetch/article-fetch-service";
import type { ArticleFetchRequest } from "@/lib/literature/article-fetch/article-fetch-types";
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
      articles: articleFetchService.listForTenant(principal.tenantId),
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
    const body = parsed as Partial<ArticleFetchRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const pmid = typeof body.pmid === "string" ? body.pmid.trim() : "";
    if (!/^\d{1,9}$/.test(pmid)) {
      return Response.json(
        { success: false, error: "A valid numeric pmid is required." },
        { status: 400 },
      );
    }

    const article = await articleFetchService.fetch({
      tenantId: principal.tenantId,
      pmid,
      source: body.source,
    });

    return Response.json({
      success: true,
      tenantId: principal.tenantId,
      pmid,
      article,
      next: {
        endpoint: "/api/evidence/package",
        method: "POST",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
