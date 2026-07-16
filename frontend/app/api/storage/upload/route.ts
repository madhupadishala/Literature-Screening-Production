import { NextRequest, NextResponse } from "next/server";

import { documentManager } from "@/lib/storage/document-manager";
import type { UploadDocumentInput } from "@/lib/storage/storage-types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UploadDocumentInput;

    const document = await documentManager.upload(body);

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error("Storage Upload Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown storage upload error",
      },
      { status: 500 },
    );
  }
}