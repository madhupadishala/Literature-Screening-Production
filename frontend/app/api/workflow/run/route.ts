import { NextResponse } from "next/server";

import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const DEFAULT_MAX_RESULTS = 20;
const MAX_MAX_RESULTS = 100;

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

function toErrorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error
      ? error.message
      : "Literature workflow execution failed.";

  const isValidationError =
    message.endsWith("is required.") ||
    message.includes("must be") ||
    message === "Invalid tenantId.";

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: isValidationError ? 400 : 500,
    },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    const body =
      (await request.json()) as WorkflowRunBody;

    const tenantId = readRequiredString(
      body.tenantId ?? body.tenant_id,
      "tenantId",
    );

    if (!TENANT_ID_PATTERN.test(tenantId)) {
      throw new Error("Invalid tenantId.");
    }

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

    return toErrorResponse(error);
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(
      {
        success: true,
        status:
          literatureWorkflowService.getStatus(),
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

    return toErrorResponse(error);
  }
}