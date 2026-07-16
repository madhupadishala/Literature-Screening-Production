import { NextRequest, NextResponse } from "next/server";
import {
  createPackageComment,
  getPackageComments,
  type CommentType,
} from "@/lib/super-user/history-store";

const allowedCommentTypes: CommentType[] = [
  "LOCK",
  "UNLOCK",
  "OVERRIDE",
  "ROUTE_BACK",
  "GENERAL",
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const packageId = searchParams.get("packageId") ?? undefined;

  return NextResponse.json({
    ok: true,
    module: "super-user-package-comments",
    generatedAt: new Date().toISOString(),
    data: getPackageComments(packageId),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const packageId = String(body.packageId ?? "").trim();
  const type = String(body.type ?? "").trim() as CommentType;
  const comment = String(body.comment ?? "").trim();
  const createdBy = String(body.createdBy ?? "Super User").trim();

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
    createdBy,
  });

  return NextResponse.json({
    ok: true,
    module: "super-user-package-comments",
    generatedAt: new Date().toISOString(),
    data: newComment,
  });
}