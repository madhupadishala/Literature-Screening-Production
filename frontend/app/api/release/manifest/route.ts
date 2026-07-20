import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { buildReleaseManifest } from "../../../../lib/release/release-manifest";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    return successResponse(buildReleaseManifest(), 200, context.requestId);
  });
}
