import { NextResponse } from "next/server";

import { literatureSourceRouter } from "@/lib/literature/global/literature-source-router";
import type { LiteratureRoutingRequest } from "@/lib/literature/global/literature-source-types";

export async function GET() {
  try {
    const result = literatureSourceRouter.route({
      tenantId: "demo-tenant",
    });

    return NextResponse.json(
      {
        success: true,
        status: literatureSourceRouter.getStatus(),
        result,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Global Source Router Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve literature source configuration.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LiteratureRoutingRequest;

    if (
      !body.tenantId ||
      typeof body.tenantId !== "string"
    ) {
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

    const routingResult = literatureSourceRouter.route({
      ...body,
      tenantId: body.tenantId.trim(),
    });

    return NextResponse.json(
      {
        success: true,
        tenantId: body.tenantId,
        routing: routingResult,
        next: {
          endpoint: "/api/literature/article-fetch",
          method: "POST",
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error("Global Literature Routing Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to route literature search.",
      },
      {
        status: 500,
      },
    );
  }
}