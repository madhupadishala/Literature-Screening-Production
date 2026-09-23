import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  finalizeIntakeLifecycleReview,
  getIntakeLifecycleReviewWorkspace,
  type IntakeReviewAction,
  type IntakeReviewType,
} from "@/lib/safety/intake/intake-lifecycle-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reviewType(request: NextRequest): IntakeReviewType {
  const raw = request.nextUrl.searchParams.get("reviewType")?.trim().toUpperCase();
  if (raw !== "QC" && raw !== "MEDICAL_REVIEW") {
    throw new Error("reviewType must be QC or MEDICAL_REVIEW.");
  }
  return raw;
}

async function authorize(request: NextRequest, type: IntakeReviewType) {
  return requireModulePermission(
    request,
    NEXUS_MODULES.INTAKE,
    type === "QC" ? PERMISSIONS.INTAKE_QC : PERMISSIONS.MEDICAL_REVIEW,
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const type = reviewType(request);
    const principal = await authorize(request, type);
    const { intakeId } = await context.params;
    const workspace = await getIntakeLifecycleReviewWorkspace({
      principal,
      intakeRecordId: intakeId,
      reviewType: type,
    });
    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const type = reviewType(request);
    const principal = await authorize(request, type);
    const { intakeId } = await context.params;
    const body = (await request.json()) as { action?: unknown; rationale?: unknown };
    if (body.action !== "APPROVE" && body.action !== "RETURN") {
      throw new Error("action must be APPROVE or RETURN.");
    }
    if (typeof body.rationale !== "string") {
      throw new Error("rationale is required.");
    }

    const workspace = await finalizeIntakeLifecycleReview({
      principal,
      intakeRecordId: intakeId,
      reviewType: type,
      action: body.action as IntakeReviewAction,
      rationale: body.rationale,
    });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
