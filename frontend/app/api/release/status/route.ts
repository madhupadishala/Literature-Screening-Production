import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { getReleaseReadinessReport } from "../../../../lib/release/release-readiness-service";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    return successResponse(await getReleaseReadinessReport(), 200, context.requestId);
  });
}
