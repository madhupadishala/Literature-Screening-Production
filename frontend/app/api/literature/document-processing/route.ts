import { NextResponse } from "next/server";

import { ocrService } from "@/lib/literature/document-processing/ocr-service";
import type { PDFProcessingRequest } from "@/lib/literature/document-processing/document-processing-types";

export async function GET() {
  return NextResponse.json({
    status: ocrService.getStatus(),
    documents: ocrService.list(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as PDFProcessingRequest;

  if (!body.tenantId || !body.pmid || !body.fileName) {
    return NextResponse.json(
      {
        error: "tenantId, pmid and fileName are required.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await ocrService.process(body);

  return NextResponse.json(
    {
      result,
    },
    {
      status: 201,
    },
  );
}