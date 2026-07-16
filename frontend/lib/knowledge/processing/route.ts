import { NextResponse } from "next/server";

import { knowledgeProcessingService } from "@/lib/knowledge/processing/knowledge-processing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const documents =
      await knowledgeProcessingService.listProcessedDocuments();

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      total: documents.length,
      documents,
    });
  } catch (error) {
    console.error(
      "Knowledge processing status failed.",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read processed knowledge.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST() {
  try {
    const result =
      await knowledgeProcessingService.processAll();

    return NextResponse.json({
      success: result.failed === 0,
      result,
    });
  } catch (error) {
    console.error(
      "Knowledge processing run failed.",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Knowledge processing failed.",
      },
      {
        status: 500,
      },
    );
  }
}