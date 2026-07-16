import { NextRequest, NextResponse } from "next/server";

import { exportStore } from "@/lib/io/export-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const job = exportStore.create(body);

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Export API Error", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown export error",
      },
      {
        status: 500,
      },
    );
  }
}