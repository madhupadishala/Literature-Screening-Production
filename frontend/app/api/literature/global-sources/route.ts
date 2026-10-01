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
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json(
        { success: false, error: "Invalid request body." },
        { status: 400 },
      );
    }
    const body = parsed as Partial<LiteratureRoutingRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    const isStringArray = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((item) => typeof item === "string");
    if (
      (body.countries !== undefined && !isStringArray(body.countries)) ||
      (body.languages !== undefined && !isStringArray(body.languages))
    ) {
      return Response.json(
        {
          success: false,
          error: "countries and languages must be arrays of strings.",
        },
        { status: 400 },
      );
    }

    const routingResult = literatureSourceRouter.route({
      tenantId: principal.tenantId,
      ...(body.countries !== undefined ? { countries: body.countries } : {}),
      ...(body.languages !== undefined ? { languages: body.languages } : {}),
    });

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
