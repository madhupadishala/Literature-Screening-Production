import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { saveCaseAssessment } from "@/lib/safety/case-processing/case-processing-service";
import {
  CASE_ASSESSMENT_TYPES,
  type CaseAssessmentType,
} from "@/lib/safety/case-processing/case-processing-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_PROCESS,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (
      typeof body.assessmentType !== "string" ||
      !(CASE_ASSESSMENT_TYPES as readonly string[]).includes(body.assessmentType)
    ) {
      throw new Error("A valid assessmentType is required.");
    }
    for (const field of ["productKey", "eventKey", "result", "rationale"]) {
      if (typeof body[field] !== "string") {
        throw new Error(`${field} is required.`);
      }
    }

    const workspace = await saveCaseAssessment({
      principal,
      caseId,
      productKey: String(body.productKey),
      eventKey: String(body.eventKey),
      assessmentType: body.assessmentType as CaseAssessmentType,
      result: String(body.result),
      rationale: String(body.rationale),
      evidence:
        body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence)
          ? (body.evidence as Record<string, unknown>)
          : {},
    });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
