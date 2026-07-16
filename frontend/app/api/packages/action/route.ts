import { NextRequest, NextResponse } from "next/server";
import { performPackageAction } from "@/lib/package-workflow-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = performPackageAction({
      packageId: body.packageId,
      action: body.action,
      assignedTo: body.assignedTo,
      routeTo: body.routeTo,
      comment: body.comment,
      performedBy: body.performedBy || "Madhu",
      role: body.role || "Super User",
      tenantId: body.tenantId || "demo-tenant",
      environment: body.environment || "PROD",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Package action failed.",
      },
      { status: 400 }
    );
  }
}