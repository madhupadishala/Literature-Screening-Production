import { NextRequest, NextResponse } from "next/server";
import {
  executeBulkAction,
  getBulkPackages,
  type BulkPackageAction,
} from "@/lib/super-user/bulk-action-store";

const allowedActions: BulkPackageAction[] = [
  "LOCK",
  "UNLOCK",
  "ROUTE_BACK",
  "OVERRIDE",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId") ?? "TENANT-CLINIXAI";

  return NextResponse.json({
    ok: true,
    module: "super-user-bulk-packages",
    generatedAt: new Date().toISOString(),
    data: getBulkPackages(tenantId),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const packageIds: string[] = Array.isArray(body.packageIds)
  ? body.packageIds.map((item: unknown) => String(item))
  : [];

  const tenantId = String(body.tenantId ?? "TENANT-CLINIXAI");
  const action = String(body.action ?? "") as BulkPackageAction;
  const comment = String(body.comment ?? "");
  const performedBy = String(body.performedBy ?? "Super User");

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
    tenantId,
    action,
    comment,
    performedBy,
  });

  return NextResponse.json({
    ok: true,
    module: "super-user-bulk-action",
    generatedAt: new Date().toISOString(),
    action,
    results,
  });
}