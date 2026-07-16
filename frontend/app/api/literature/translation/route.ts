import { NextResponse } from "next/server";

import { medicalTranslationService } from "@/lib/literature/translation/medical-translation-service";
import type { MedicalTranslationRequest } from "@/lib/literature/translation/translation-types";

export async function GET() {
  return NextResponse.json({
    status: medicalTranslationService.getStatus(),
    translations: medicalTranslationService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as MedicalTranslationRequest;

  if (!body.tenantId || !body.sourceText) {
    return NextResponse.json(
      {
        error: "tenantId and sourceText are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = medicalTranslationService.translate(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}