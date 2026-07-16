import { NextRequest, NextResponse } from "next/server";

import { checkPermission } from "@/lib/rbac/rbac-store";

import type { PermissionAction } from "@/lib/rbac/rbac-rules";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      permission?: PermissionAction;
    };

    if (!body.permission) {
      return NextResponse.json(
        {
          allowed: false,
          message: "permission is required.",
        },
        { status: 400 }
      );
    }

    const result = checkPermission(body.permission);

    return NextResponse.json(result);
  } catch (error) {
    console.error("RBAC permission check failed", error);

    return NextResponse.json(
      {
        allowed: false,
        message: "Unable to validate permission.",
      },
      { status: 500 }
    );
  }
}