import { NextRequest, NextResponse } from "next/server";
import {
  executeBulkAction,
  getBulkPackages,
  type BulkPackageAction,
} from "@/lib/super-user/bulk-action-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

const allowedActions: BulkPackageAction[] = [
  "LOCK",
  "UNLOCK",
  "ROUTE_BACK",
  "OVERRIDE",
];

export async function GET(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);

    return NextResponse.json({
      ok: true,
      module: "super-user-bulk-packages",
      generatedAt: new Date().toISOString(),
      data: getBulkPackages(principal.tenantKey),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);
    const body = await request.json();

    const packageIds: string[] = Array.isArray(body.packageIds)
      ? body.packageIds.map((item: unknown) => String(item))
      : [];

    const action = String(body.action ?? "") as BulkPackageAction;
    const comment = String(body.comment ?? "");

    if (packageIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "At least one package must be selected.",
        },
        { status: 400 },
      );
    }

    if (!allowedActions.includes(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid bulk action.",
        },
        { status: 400 },
      );
    }

    if (!comment.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Mandatory justification comment is required.",
        },
        { status: 400 },
      );
    }

    const results = executeBulkAction({
      packageIds,
      tenantId: principal.tenantKey,
      action,
      comment,
      // Previously trusted a client-supplied `performedBy` string, so any
      // caller could attribute a bulk lock/unlock/override to someone
      // else. Now this is always the authenticated caller.
      performedBy: principal.displayName || principal.email,
    });

    return NextResponse.json({
      ok: true,
      module: "super-user-bulk-action",
      generatedAt: new Date().toISOString(),
      action,
      results,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}