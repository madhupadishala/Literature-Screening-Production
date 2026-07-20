import { ValidationError } from "../../../../lib/enterprise/errors";
import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { readJsonBody } from "../../../../lib/enterprise/request-guard";
import { RELEASE_CHECKLIST } from "../../../../lib/release/release-checklist";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";
import { readReleaseState, updateChecklistRecord } from "../../../../lib/release/release-state-store";
import type { GateStatus } from "../../../../lib/release/types";

export const dynamic = "force-dynamic";

interface ChecklistUpdateBody {
  id?: string;
  status?: GateStatus;
  updatedBy?: string;
  notes?: string;
}

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const state = await readReleaseState();
    const records = RELEASE_CHECKLIST.map((definition) => ({
      ...definition,
      ...(state.checklist[definition.id] || { id: definition.id, status: "pending" as const }),
    }));
    return successResponse(records, 200, context.requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const body = await readJsonBody<ChecklistUpdateBody>(request);
    const definition = RELEASE_CHECKLIST.find((item) => item.id === body.id);
    if (!definition) throw new ValidationError("Unknown release checklist item.");
    if (!body.status || !["passed", "failed", "pending", "waived"].includes(body.status)) {
      throw new ValidationError("A valid checklist status is required.");
    }

    await updateChecklistRecord({
      id: definition.id,
      status: body.status,
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy?.trim() || "release-operator",
      notes: body.notes?.trim() || undefined,
    });

    return successResponse({ updated: true, id: definition.id }, 200, context.requestId);
  });
}
