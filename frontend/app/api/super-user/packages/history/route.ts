import { NextRequest, NextResponse } from "next/server";
import { getPackageHistory } from "@/lib/super-user/history-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const packageId = searchParams.get("packageId") ?? undefined;

  const history = getPackageHistory(packageId);

  return NextResponse.json({
    ok: true,
    module: "super-user-package-history",
    generatedAt: new Date().toISOString(),
    data: history,
  });
}