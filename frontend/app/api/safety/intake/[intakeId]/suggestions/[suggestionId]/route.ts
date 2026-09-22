import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  reviewExtractionSuggestion,
  type SuggestionDecision,
} from "@/lib/safety/intake/intake-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS: readonly SuggestionDecision[] = [
  "ACCEPTED",
  "REJECTED",
  "EDITED",
];

interface ReviewBody {
  decision?: unknown;
  finalPayload?: unknown;
  reason?: unknown;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string; suggestionId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId, suggestionId } = await context.params;
    const body = (await request.json()) as ReviewBody;

    if (
      typeof body.decision !== "string" ||
      !(DECISIONS as readonly string[]).includes(body.decision)
    ) {
      throw new Error("A valid review decision is required.");
    }
    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }
    if (
      body.finalPayload !== undefined &&
      (!body.finalPayload ||
        typeof body.finalPayload !== "object" ||
        Array.isArray(body.finalPayload))
    ) {
      throw new Error("finalPayload must be an object when provided.");
    }

    const workspace = await reviewExtractionSuggestion({
      principal,
      intakeRecordId: intakeId,
      suggestionId,
      decision: body.decision as SuggestionDecision,
      finalPayload: body.finalPayload as Record<string, unknown> | undefined,
      reason: body.reason,
    });

    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
