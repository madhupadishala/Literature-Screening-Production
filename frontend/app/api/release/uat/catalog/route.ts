import { runRoute, successResponse } from "../../../../../lib/enterprise/api-response";
import { authorizeReleaseRoute } from "../../../../../lib/release/release-route";
import { UAT_SCENARIOS } from "../../../../../lib/release/uat-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    return successResponse(UAT_SCENARIOS, 200, context.requestId);
  });
}
