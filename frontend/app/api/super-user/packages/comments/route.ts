import { NextRequest, NextResponse } from "next/server";
import {
  createPackageComment,
  getPackageComments,
  type CommentType,
} from "@/lib/super-user/history-store";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";

const allowedCommentTypes: CommentType[] = [
  "LOCK",
  "UNLOCK",
  "OVERRIDE",
  "ROUTE_BACK",
  "GENERAL",
];

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);

    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get("packageId") ?? undefined;

    return NextResponse.json({
      ok: true,
      module: "super-user-package-comments",
      generatedAt: new Date().toISOString(),
      data: getPackageComments(packageId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(request, PERMISSIONS.SUPER_USER_CONSOLE_MANAGE);
    const body = await request.json();

    const packageId = String(body.packageId ?? "").trim();
    const type = String(body.type ?? "").trim() as CommentType;
    const comment = String(body.comment ?? "").trim();

    if (!packageId) {
      return NextResponse.json(
        {
          ok: false,
          error: "packageId is required.",
        },
        { status: 400 },
      );
    }

    if (!allowedCommentTypes.includes(type)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Valid comment type is required. Allowed values: LOCK, UNLOCK, OVERRIDE, ROUTE_BACK, GENERAL.",
        },
        { status: 400 },
      );
    }

    if (!comment) {
      return NextResponse.json(
        {
          ok: false,
          error: "Comment is mandatory.",
        },
        { status: 400 },
      );
    }

    const newComment = createPackageComment({
      packageId,
      type,
      comment,
      // Previously a free-text, client-supplied createdBy field -- anyone
      // could attribute a comment to any name. Now always the
      // authenticated caller.
      createdBy: principal.displayName || principal.email,
    });

    return NextResponse.json({
      ok: true,
      module: "super-user-package-comments",
      generatedAt: new Date().toISOString(),
      data: newComment,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
