import { NextResponse } from "next/server";
import { getPlatformHealth } from "@/lib/platform/monitoring/platform-monitor";

export async function GET() {
  return NextResponse.json(getPlatformHealth());
}