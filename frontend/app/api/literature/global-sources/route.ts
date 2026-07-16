import { NextResponse } from "next/server";

import { literatureSourceRouter } from "@/lib/literature/global/literature-source-router";
import type { LiteratureRoutingRequest } from "@/lib/literature/global/literature-source-types";

export async function GET() {
  return NextResponse.json({
    status: literatureSourceRouter.getStatus(),
    result: literatureSourceRouter.route({
      tenantId: "demo-tenant",
    }),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as LiteratureRoutingRequest;

  if (!body.tenantId) {
    return NextResponse.json(
      {
        error: "tenantId is required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = literatureSourceRouter.route(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}