import { NextResponse } from "next/server";

import { runAISelfTest } from "@/lib/ai/ai-self-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = runAISelfTest();

  return NextResponse.json(
    {
      success: result.passed,
      data: result,
    },
    {
      status: result.passed ? 200 : 503,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
