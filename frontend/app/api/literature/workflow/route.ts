import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";
import type { LiteratureWorkflowRequest } from "@/lib/literature/workflow/literature-workflow-types";
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
      status: literatureWorkflowService.getStatus(principal.tenantId),
      history: literatureWorkflowService.list(principal.tenantId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SEARCH_EXECUTE);
    const body = (await request.json()) as LiteratureWorkflowRequest;
    if (!body.query) throw new Error("query is required.");

    const result = await literatureWorkflowService.execute({
      tenantId: principal.tenantId,
      query: body.query.trim(),
      maxResults: body.maxResults,
    });

    return NextResponse.json(
      { success: true, workflowStage: "WORKFLOW_COMPLETED", result },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
