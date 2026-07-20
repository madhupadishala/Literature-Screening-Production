import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { readJsonBody } from "../../../../lib/enterprise/request-guard";
import { createReleaseCandidate } from "../../../../lib/release/release-candidate-service";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";
import { readReleaseState } from "../../../../lib/release/release-state-store";

export const dynamic = "force-dynamic";

interface CandidateBody {
  createdBy?: string;
}

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    return successResponse((await readReleaseState()).candidates, 200, context.requestId);
  });
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const body = await readJsonBody<CandidateBody>(request);
    const candidate = await createReleaseCandidate(body.createdBy);
    return successResponse(candidate, 201, context.requestId);
  });
}
