import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import {
  listLiteratureSources,
  listRecentSearches,
} from "@/lib/literature/adhoc-search/search-repository";
import { executeAdHocSearch } from "@/lib/literature/adhoc-search/search-service";
import type { AdHocSearchCriteria } from "@/lib/literature/adhoc-search/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SEARCH_EXECUTE,
    );

    const [sources, recentSearches] = await Promise.all([
      listLiteratureSources(principal),
      principal.hasPermission(PERMISSIONS.SEARCH_HISTORY_VIEW)
        ? listRecentSearches(principal, 25)
        : Promise.resolve([]),
    ]);

    return Response.json({
      success: true,
      data: {
        principal: {
          tenantKey: principal.tenantKey,
          displayName: principal.displayName,
          roleKey: principal.roleKey,
        },
        sources,
        recentSearches,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SEARCH_EXECUTE,
    );

    const body = (await request.json()) as {
      criteria?: AdHocSearchCriteria;
    };

    const execution = await executeAdHocSearch({
      principal,
      criteria: body.criteria || {},
    });

    return Response.json(
      {
        success: true,
        data: execution,
      },
      {
        status: execution.status === "failed" ? 502 : 200,
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
