import { NextResponse } from "next/server";

import { evidenceNormalizationService } from "@/lib/literature/evidence-normalization/evidence-normalization-service";
import type { RawEvidenceInput } from "@/lib/literature/evidence-normalization/evidence-normalization-types";

export async function GET() {
  return NextResponse.json({
    status: evidenceNormalizationService.getStatus(),
    packages: evidenceNormalizationService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RawEvidenceInput;

  if (!body.tenantId || !body.sourceId || !body.content) {
    return NextResponse.json(
      {
        error: "tenantId, sourceId and content are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = evidenceNormalizationService.normalize(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}