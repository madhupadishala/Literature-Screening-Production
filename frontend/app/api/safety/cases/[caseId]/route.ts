import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getCaseWorkspace,
  saveCaseDraft,
} from "@/lib/safety/case-processing/case-processing-service";
import type { CaseDraftPayload } from "@/lib/safety/case-processing/case-processing-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_VIEW,
    );
    const { caseId } = await context.params;
    const workspace = await getCaseWorkspace({ principal, caseId });
    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(
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
    const body = (await request.json()) as {
      draft?: unknown;
      changeReason?: unknown;
      sourceKind?: unknown;
    };

    if (!body.draft || typeof body.draft !== "object" || Array.isArray(body.draft)) {
      throw new Error("A case draft object is required.");
    }
    if (typeof body.changeReason !== "string") {
      throw new Error("changeReason is required.");
    }

    const allowedSourceKinds = [
      "PROCESSOR",
      "QC_CORRECTION",
      "MEDICAL_CORRECTION",
      "FOLLOW_UP_MERGE",
    ] as const;

    const sourceKind =
      typeof body.sourceKind === "string" &&
      (allowedSourceKinds as readonly string[]).includes(body.sourceKind)
        ? (body.sourceKind as (typeof allowedSourceKinds)[number])
        : "PROCESSOR";

    const workspace = await saveCaseDraft({
      principal,
      caseId,
      draft: body.draft as CaseDraftPayload,
      changeReason: body.changeReason,
      sourceKind,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
