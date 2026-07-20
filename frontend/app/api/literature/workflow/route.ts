import { NextResponse } from "next/server";

import { literatureWorkflowService } from "@/lib/literature/workflow/literature-workflow-service";

import type {
  LiteratureWorkflowRequest,
} from "@/lib/literature/workflow/literature-workflow-types";

export async function GET() {
  return NextResponse.json(
    {
      success: true,

      status:
        literatureWorkflowService.getStatus(),

      history:
        literatureWorkflowService.list(),
    },
    {
      status: 200,
    },
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as LiteratureWorkflowRequest;

    if (
      !body.tenantId ||
      !body.query
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "tenantId and query are required.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await literatureWorkflowService.execute({
        tenantId: body.tenantId,

        query: body.query.trim(),

        maxResults:
          body.maxResults,
      });

    return NextResponse.json(
      {
        success: true,

        workflowStage:
          "WORKFLOW_COMPLETED",

        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Workflow Error",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown workflow error",
      },
      {
        status: 500,
      },
    );
  }
}