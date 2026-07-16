import { NextResponse } from "next/server";

import { knowledgeChunkingService } from "@/lib/knowledge/chunking/knowledge-chunking-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const documents =
      await knowledgeChunkingService.listChunkedDocuments();

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      total: documents.length,
      documents,
    });
  } catch (error) {
    console.error(
      "Unable to read chunked knowledge.",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read chunked knowledge.",
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
      await knowledgeChunkingService.chunkAll();

    return NextResponse.json({
      success: result.failed === 0,
      result,
    });
  } catch (error) {
    console.error(
      "Knowledge chunking run failed.",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Knowledge chunking failed.",
      },
      {
        status: 500,
      },
    );
  }
}