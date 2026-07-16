import { NextRequest, NextResponse } from "next/server";
import {
  assignPackage,
  getPackageAssignments,
} from "@/lib/super-user/assignment-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const packageId = searchParams.get("packageId") ?? "";

  if (!packageId) {
    return NextResponse.json(
      {
        ok: false,
        error: "packageId is required.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    module: "super-user-package-assignments",
    generatedAt: new Date().toISOString(),
    data: getPackageAssignments(packageId),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const result = assignPackage({
    packageId: String(body.packageId ?? ""),
    tenantId: String(body.tenantId ?? "TENANT-CLINIXAI"),
    assignedToUserId: String(body.assignedToUserId ?? ""),
    assignedBy: String(body.assignedBy ?? "Super User"),
    reason: String(body.reason ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    module: "super-user-package-assignment",
    generatedAt: new Date().toISOString(),
    message: result.message,
    data: result.assignment,
  });
}