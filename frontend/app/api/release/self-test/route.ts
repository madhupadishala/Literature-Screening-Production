import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";
import { runReleaseSelfTest } from "../../../../lib/release/release-self-test";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const report = runReleaseSelfTest();
    return successResponse(report, report.passed ? 200 : 500, context.requestId);
  });
}
