import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { finalizeLifecycleTriageAssessment } from "@/lib/safety/triage/triage-lifecycle-service";
import { getTriageWorkspace } from "@/lib/safety/triage/triage-service";
import type { FinalTriageDecision } from "@/lib/safety/triage/triage-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const { intakeId } = await context.params;
    const workspace = await getTriageWorkspace({
      principal,
      intakeRecordId: intakeId,
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
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId } = await context.params;
    const body = (await request.json()) as { decision?: unknown };

    if (!body.decision || typeof body.decision !== "object" || Array.isArray(body.decision)) {
      throw new Error("A triage decision object is required.");
    }

    const workspace = await finalizeLifecycleTriageAssessment({
      principal,
      intakeRecordId: intakeId,
      decision: body.decision as FinalTriageDecision,
    });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
