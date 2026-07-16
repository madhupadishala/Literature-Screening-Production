import { NextRequest, NextResponse } from "next/server";

import { importStore } from "@/lib/io/import-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const job = importStore.create(body);

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Import API Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown import error",
      },
      {
        status: 500,
      },
    );
  }
}