import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";
import type { LiteratureWorkflowRequest } from "@/lib/literature/workflow/literature-workflow-types";
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
      status: literatureWorkflowService.getStatusForTenant(principal.tenantId),
      history: literatureWorkflowService.listForTenant(principal.tenantId),
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
    const body = (await request.json()) as Partial<LiteratureWorkflowRequest>;

    assertRequestedTenantMatchesScope(principal, body.tenantId);

    if (!body.query || typeof body.query !== "string") {
      return Response.json(
        { success: false, error: "query is required." },
        { status: 400 },
      );
    }

    const result = await literatureWorkflowService.execute({
      tenantId: principal.tenantId,
      query: body.query.trim(),
      maxResults: body.maxResults,
    });

    return Response.json(
      {
        success: true,
        workflowStage: "WORKFLOW_COMPLETED",
        result,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
