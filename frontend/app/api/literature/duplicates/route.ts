import { NextResponse } from "next/server";

import { duplicateService } from "@/lib/literature/duplicates/duplicate-service";
import type { DuplicateCheckRequest } from "@/lib/literature/duplicates/duplicate-types";

export async function GET() {
  return NextResponse.json({
    status: duplicateService.getStatus(),
    history: duplicateService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as DuplicateCheckRequest;

  if (!body.tenantId || !body.candidate) {
    return NextResponse.json(
      {
        error: "tenantId and candidate are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = duplicateService.check(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}