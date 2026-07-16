import { NextRequest, NextResponse } from "next/server";
import { getPackageAudit, searchPackages } from "@/lib/package-workflow-store";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const query = searchParams.get("query") || "";
    const tenantId = searchParams.get("tenant_id") || "demo-tenant";

    const packages = searchPackages(query, tenantId);

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      count: packages.length,
      packages,
      audit: packages[0] ? getPackageAudit(packages[0].packageId) : [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Package search failed.",
      },
      { status: 500 }
    );
  }
}