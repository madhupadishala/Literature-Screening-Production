import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "Test console run endpoint is active.",
    generatedAt: new Date().toISOString(),
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Test console run endpoint is active.",
    generatedAt: new Date().toISOString(),
  });
}