import { runRoute, successResponse } from "../../../../../lib/enterprise/api-response";
import { readJsonBody } from "../../../../../lib/enterprise/request-guard";
import {
  authorizeReleaseRoute,
  readMonitoringToken,
  resolveProbeBaseUrl,
} from "../../../../../lib/release/release-route";
import { runAutomatedUat } from "../../../../../lib/release/uat-runner";

export const dynamic = "force-dynamic";

interface RunBody {
  scenarioIds?: string[];
  executedBy?: string;
}

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const body = await readJsonBody<RunBody>(request);
    const evidence = await runAutomatedUat({
      baseUrl: resolveProbeBaseUrl(request),
      token: readMonitoringToken(request),
      scenarioIds: Array.isArray(body.scenarioIds) ? body.scenarioIds : undefined,
      executedBy: body.executedBy,
    });

    return successResponse(
      {
        passed: evidence.every((item) => item.outcome === "passed"),
        evidence,
      },
      200,
      context.requestId,
    );
  });
}
