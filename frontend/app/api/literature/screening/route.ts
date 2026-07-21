import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  executeScreening,
  listScreeningWorklist,
  saveScreeningReview,
} from "@/lib/literature/screening/screening-workflow-service";
import type {
  ExecuteScreeningInput,
  SaveScreeningReviewInput,
} from "@/lib/literature/screening/screening-workflow-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScreeningActionRequest =
  | { action: "execute"; input: ExecuteScreeningInput }
  | { action: "review"; input: SaveScreeningReviewInput };

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SEARCH_HISTORY_VIEW,
    );
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") || 250);
    const records = await listScreeningWorklist({
      principal,
      limit: Number.isFinite(rawLimit) ? rawLimit : 250,
    });

    return Response.json({
      success: true,
      data: { records, count: records.length },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as ScreeningActionRequest;

    if (body.action === "execute") {
      const principal = await requirePermission(
        request,
        PERMISSIONS.SCREENING_EXECUTE,
      );
      const record = await executeScreening({ principal, request: body.input });
      return Response.json({ success: true, data: record }, { status: 201 });
    }

    if (body.action === "review") {
      const principal = await requirePermission(
        request,
        PERMISSIONS.SCREENING_REVIEW,
      );
      const mutation = await saveScreeningReview({
        principal,
        review: body.input,
      });
      return Response.json({ success: true, data: mutation });
    }

    throw new Error("Invalid Screening workflow action.");
  } catch (error) {
    return routeErrorResponse(error);
  }
}
