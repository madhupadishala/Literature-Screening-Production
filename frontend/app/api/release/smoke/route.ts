import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { readJsonBody } from "../../../../lib/enterprise/request-guard";
import {
  authorizeReleaseRoute,
  readMonitoringToken,
  resolveProbeBaseUrl,
} from "../../../../lib/release/release-route";
import { runSmokeSuite } from "../../../../lib/release/smoke-runner";

export const dynamic = "force-dynamic";

interface SmokeBody {
  executedBy?: string;
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const body = await readJsonBody<SmokeBody>(request);
    const run = await runSmokeSuite({
      baseUrl: resolveProbeBaseUrl(request),
      token: readMonitoringToken(request),
      executedBy: body.executedBy,
    });
    return successResponse(run, 200, context.requestId);
  });
}
