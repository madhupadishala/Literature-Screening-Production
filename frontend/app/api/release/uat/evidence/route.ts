import { createId } from "../../../../../lib/enterprise/id";
import { ValidationError } from "../../../../../lib/enterprise/errors";
import { runRoute, successResponse } from "../../../../../lib/enterprise/api-response";
import { readJsonBody } from "../../../../../lib/enterprise/request-guard";
import { buildReleaseManifest } from "../../../../../lib/release/release-manifest";
import { authorizeReleaseRoute } from "../../../../../lib/release/release-route";
import { appendUatEvidence, readReleaseState } from "../../../../../lib/release/release-state-store";
import { UAT_SCENARIOS } from "../../../../../lib/release/uat-catalog";
import type { EvidenceOutcome } from "../../../../../lib/release/types";

export const dynamic = "force-dynamic";

interface EvidenceBody {
  scenarioId?: string;
  outcome?: EvidenceOutcome;
  executedBy?: string;
  notes?: string;
  attachments?: string[];
}

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    return successResponse((await readReleaseState()).uatEvidence, 200, context.requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const body = await readJsonBody<EvidenceBody>(request);
    const scenario = UAT_SCENARIOS.find((item) => item.id === body.scenarioId);
    if (!scenario || scenario.mode !== "manual") {
      throw new ValidationError("A valid manual UAT scenario is required.");
    }
    if (!body.outcome || !["passed", "failed", "blocked"].includes(body.outcome)) {
      throw new ValidationError("A valid UAT outcome is required.");
    }
    if (!body.executedBy?.trim()) {
      throw new ValidationError("Tester identity is required for manual UAT evidence.");
    }

    const evidence = {
      id: createId("uat"),
      scenarioId: scenario.id,
      mode: "manual" as const,
      outcome: body.outcome,
      executedAt: new Date().toISOString(),
      executedBy: body.executedBy.trim(),
      notes: body.notes?.trim() || undefined,
      attachments: body.attachments?.filter((item) => typeof item === "string" && item.trim()) || undefined,
      manifestHash: buildReleaseManifest().manifestHash,
    };
    await appendUatEvidence(evidence);

    return successResponse(evidence, 201, context.requestId);
  });
}
