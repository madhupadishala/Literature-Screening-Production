import { NextRequest, NextResponse } from "next/server";

import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const DEFAULT_MAX_RESULTS = 20;
const MAX_MAX_RESULTS = 500;

interface WorkflowRunBody {
  tenantId?: unknown;
  tenant_id?: unknown;
  query?: unknown;
  maxResults?: unknown;
  max_results?: unknown;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function readMaxResults(value: unknown): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return DEFAULT_MAX_RESULTS;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(numericValue) ||
    numericValue < 1
  ) {
    throw new Error(
      "maxResults must be a positive number.",
    );
  }

  return Math.min(
    Math.floor(numericValue),
    MAX_MAX_RESULTS,
  );
}

export async function POST(
  request: NextRequest,
): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.PACKAGE_ACTION_EXECUTE,
    );

    const body =
      (await request.json()) as WorkflowRunBody;

    // A tenantId may still arrive in the body for backward compatibility
    // with older callers, but it is validated against a strict pattern
    // and, more importantly, is never actually trusted -- the workflow
    // always runs against the authenticated caller's own verified tenant
    // below, so a client can no longer trigger a run against a tenant it
    // doesn't belong to just by changing this field.
    const requestedTenantId = body.tenantId ?? body.tenant_id;

    if (
      requestedTenantId !== undefined &&
      (typeof requestedTenantId !== "string" ||
        !TENANT_ID_PATTERN.test(requestedTenantId))
    ) {
      throw new Error("Invalid tenantId.");
    }

    const tenantId = principal.tenantKey;

    const query = readRequiredString(
      body.query,
      "query",
    );

    const maxResults = readMaxResults(
      body.maxResults ?? body.max_results,
    );

    const workflow =
      await literatureWorkflowService.execute({
        tenantId,
        query,
        maxResults,
      });

    const searchResults =
      workflow.search?.articles?.length ?? 0;

    const processedArticles =
      workflow.articles?.length ?? 0;

    const duplicateArticles =
      workflow.articles?.filter(
        (article) =>
          article.duplicateResult?.isDuplicate === true,
      ).length ?? 0;

    const includedArticles =
      workflow.articles?.filter(
        (article) =>
          article.screeningResult?.decision ===
          "INCLUDE",
      ).length ?? 0;

    const excludedArticles =
      workflow.articles?.filter(
        (article) =>
          article.screeningResult?.decision ===
          "EXCLUDE",
      ).length ?? 0;

    const reviewArticles =
      workflow.articles?.filter(
        (article) =>
          article.screeningResult?.decision ===
          "REVIEW",
      ).length ?? 0;

    return NextResponse.json(
      {
        success: true,
        workflowStage: workflow.workflowStage,
        tenantId: workflow.tenantId,
        query: workflow.query,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        statistics: {
          searchResults,
          processedArticles,
          duplicateArticles,
          includedArticles,
          excludedArticles,
          reviewArticles,
        },
        workflow,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[api/workflow/run] Literature workflow failed:",
      error,
    );

    return routeErrorResponse(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.PACKAGE_ACTION_EXECUTE,
    );

    return NextResponse.json(
      {
        success: true,
        status:
          literatureWorkflowService.getStatus(principal.tenantId),
        performance:
          literatureWorkflowService.getPerformanceStatus(),
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[api/workflow/run] Status retrieval failed:",
      error,
    );

    return routeErrorResponse(error);
  }
}