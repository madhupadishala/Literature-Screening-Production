import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { literatureSourceRouter } from "@/lib/literature/global/literature-source-router";
import type { LiteratureRoutingRequest } from "@/lib/literature/global/literature-source-types";
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
      PERMISSIONS.SEARCH_EXECUTE,
    );
    const result = literatureSourceRouter.route({ tenantId: principal.tenantId });

    return Response.json({
      success: true,
      status: literatureSourceRouter.getStatus(),
      result,
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
    const body = (await request.json()) as Partial<LiteratureRoutingRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const routingResult = literatureSourceRouter.route({
      ...body,
      tenantId: principal.tenantId,
    } as LiteratureRoutingRequest);

    return Response.json({
      success: true,
      tenantId: principal.tenantId,
      routing: routingResult,
      next: {
        endpoint: "/api/literature/article-fetch",
        method: "POST",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
