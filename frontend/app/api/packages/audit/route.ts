import { NextRequest, NextResponse } from "next/server";
import { getPackageAudit } from "@/lib/package-workflow-store";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const packageId = searchParams.get("package_id") || "";

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "package_id is required." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      package_id: packageId,
      audit: getPackageAudit(packageId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Audit fetch failed.",
      },
      { status: 500 }
    );
  }
}