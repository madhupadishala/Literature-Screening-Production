import { NextRequest, NextResponse } from "next/server";
import { getPackageAudit, searchPackages } from "@/lib/package-workflow-store";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const packageId = searchParams.get("package_id") || "";
    const tenantId = searchParams.get("tenant_id") || "demo-tenant";

    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "package_id is required." },
        { status: 400 }
      );
    }

    const pkg = searchPackages("", tenantId).find((item) => item.packageId === packageId);

    if (!pkg) {
      return NextResponse.json(
        { success: false, error: "Package not found." },
        { status: 404 }
      );
    }

    const audit = getPackageAudit(packageId);

    return NextResponse.json({
      success: true,
      package: pkg,
      history: [
        {
          version: pkg.version,
          state: pkg.currentState,
          locked: pkg.locked,
          updatedAt: pkg.updatedAt,
          assignedTo: pkg.assignedTo,
        },
      ],
      audit,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "History fetch failed.",
      },
      { status: 500 }
    );
  }
}