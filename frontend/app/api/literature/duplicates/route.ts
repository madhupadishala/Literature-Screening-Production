import { NextResponse } from "next/server";

import { duplicateService } from "@/lib/literature/duplicates/duplicate-service";

import type {
  DuplicateCheckRequest,
} from "@/lib/literature/duplicates/duplicate-types";

export async function GET() {
  return NextResponse.json({
    status: duplicateService.getStatus(),
    history: duplicateService.list(),
  });
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as DuplicateCheckRequest;

    if (!body.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!body.article) {
      return NextResponse.json(
        {
          success: false,
          error: "article is required.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await duplicateService.check({
        tenantId: body.tenantId,

        article: body.article,

        existingArticles:
          body.existingArticles ?? [],
      });

    return NextResponse.json(
      {
        success: true,

        workflowStage:
          "DUPLICATE_CHECK_COMPLETED",

        result,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Duplicate Detection Error",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown duplicate detection error",
      },
      {
        status: 500,
      },
    );
  }
}