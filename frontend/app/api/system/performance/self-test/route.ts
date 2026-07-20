import { NextResponse } from "next/server";

import { runPerformanceSelfTest } from "@/lib/performance/performance-self-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const result =
      await runPerformanceSelfTest();

    return NextResponse.json(
      {
        success: result.passed,
        data: result,
      },
      {
        status: result.passed ? 200 : 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown performance self-test error.",
      },
      {
        status: 500,
      },
    );
  }
}
