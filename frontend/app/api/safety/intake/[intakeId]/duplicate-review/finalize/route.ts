import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { finalizeDuplicateGateReview } from "@/lib/safety/duplicate/duplicate-gate-service";
import type { DuplicateHumanDecision } from "@/lib/safety/duplicate/duplicate-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS: readonly DuplicateHumanDecision[] = [
  "NEW_CASE",
  "FOLLOW_UP",
  "DUPLICATE",
  "NOT_MATCH",
];

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
    const body = (await request.json()) as {
      humanDecision?: unknown;
      selectedCandidateId?: unknown;
      rationale?: unknown;
    };

    if (
      typeof body.humanDecision !== "string" ||
      !(DECISIONS as readonly string[]).includes(body.humanDecision)
    ) {
      throw new Error("A valid humanDecision is required.");
    }
    if (typeof body.rationale !== "string") {
      throw new Error("rationale is required.");
    }

    const workspace = await finalizeDuplicateGateReview({
      principal,
      intakeRecordId: intakeId,
      humanDecision: body.humanDecision as DuplicateHumanDecision,
      selectedCandidateId:
        typeof body.selectedCandidateId === "string"
          ? body.selectedCandidateId
          : null,
      rationale: body.rationale,
    });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
