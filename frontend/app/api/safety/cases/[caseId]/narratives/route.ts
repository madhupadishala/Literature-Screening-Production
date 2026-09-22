import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  generateSystemNarrative,
  saveNarrativeVersion,
} from "@/lib/safety/case-processing/case-processing-service";
import type { CaseNarrativeStage } from "@/lib/safety/case-processing/case-processing-types";

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
    const body = (await request.json()) as {
      action?: unknown;
      narrativeStage?: unknown;
      narrativeText?: unknown;
      changeReason?: unknown;
    };

    if (typeof body.changeReason !== "string") {
      throw new Error("changeReason is required.");
    }

    const workspace =
      body.action === "GENERATE_SYSTEM_DRAFT"
        ? await generateSystemNarrative({
            principal,
            caseId,
            changeReason: body.changeReason,
          })
        : await saveNarrativeVersion({
            principal,
            caseId,
            narrativeStage: "PROCESSOR" as CaseNarrativeStage,
            narrativeText:
              typeof body.narrativeText === "string"
                ? body.narrativeText
                : "",
            changeReason: body.changeReason,
          });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
