import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Workflow list endpoint is active.",
    generatedAt: new Date().toISOString(),
  });
}