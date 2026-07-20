import { NextRequest, NextResponse } from "next/server";

import { screeningService } from "@/lib/literature/screening/screening-service";

import type { ScreeningRequest } from "@/lib/literature/screening/screening-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  tenantId?: unknown;
  article?: {
    pmid?: unknown;
    title?: unknown;
    abstract?: unknown;
    authors?: unknown;
    doi?: unknown;
    journal?: unknown;
    publicationType?: unknown;
    language?: unknown;
  };
};

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function normalizeOptionalString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : undefined;
}

function normalizeAuthors(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (author): author is string =>
        typeof author === "string",
    )
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
}

function validateBody(
  body: RequestBody,
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isNonEmptyString(body.tenantId)) {
    errors.push(
      "tenantId is required and must be a non-empty string.",
    );
  }

  if (
    typeof body.article !== "object" ||
    body.article === null
  ) {
    errors.push(
      "article is required and must be an object.",
    );

    return {
      valid: false,
      errors,
    };
  }

  if (!isNonEmptyString(body.article.pmid)) {
    errors.push(
      "article.pmid is required and must be a non-empty string.",
    );
  }

  if (!isNonEmptyString(body.article.title)) {
    errors.push(
      "article.title is required and must be a non-empty string.",
    );
  }

  if (
    body.article.abstract !== undefined &&
    body.article.abstract !== null &&
    typeof body.article.abstract !== "string"
  ) {
    errors.push(
      "article.abstract must be a string when provided.",
    );
  }

  if (
    body.article.authors !== undefined &&
    !Array.isArray(body.article.authors)
  ) {
    errors.push(
      "article.authors must be an array when provided.",
    );
  }

  if (
    body.article.doi !== undefined &&
    body.article.doi !== null &&
    typeof body.article.doi !== "string"
  ) {
    errors.push(
      "article.doi must be a string when provided.",
    );
  }

  if (
    body.article.journal !== undefined &&
    body.article.journal !== null &&
    typeof body.article.journal !== "string"
  ) {
    errors.push(
      "article.journal must be a string when provided.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    let body: RequestBody;

    try {
      body =
        (await request.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        {
          status: 400,
        },
      );
    }

    const validation =
      validateBody(body);

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid literature screening request.",
          validationErrors:
            validation.errors,
          expectedStructure: {
            tenantId: "string",
            article: {
              pmid: "string",
              title: "string",
              abstract: "string | optional",
              authors: "string[] | optional",
              doi: "string | optional",
              journal: "string | optional",
            },
          },
        },
        {
          status: 400,
        },
      );
    }

    /*
     * These values have already been validated above.
     * The assertions are limited to the validated boundary.
     */
    const tenantId =
      body.tenantId as string;

    const article =
      body.article as NonNullable<
        RequestBody["article"]
      >;

    const screeningRequest: ScreeningRequest =
      {
        tenantId: tenantId.trim(),

        article: {
          pmid:
            (
              article.pmid as string
            ).trim(),

          title:
            (
              article.title as string
            ).trim(),

          abstract:
            normalizeOptionalString(
              article.abstract,
            ) ?? "",

          authors:
            normalizeAuthors(
              article.authors,
            ),

          doi:
            normalizeOptionalString(
              article.doi,
            ),

          journal:
            normalizeOptionalString(
              article.journal,
            ),
        },
      };

    const result =
      await screeningService.screenArticle(
        screeningRequest,
      );

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[Literature Screening API] Screening execution failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Literature screening execution failed.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown screening error.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const status =
      screeningService.getStatus();

    const history =
      screeningService.list(50);

    return NextResponse.json(
      {
        success: true,
        data: {
          status,
          history,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "[Literature Screening API] Status retrieval failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          "Unable to retrieve literature screening status.",
        message:
          error instanceof Error
            ? error.message
            : "Unknown screening status error.",
      },
      {
        status: 500,
      },
    );
  }
}