import { runRoute, successResponse } from "../../../../lib/enterprise/api-response";
import { getReleaseReadinessReport } from "../../../../lib/release/release-readiness-service";
import { authorizeReleaseRoute } from "../../../../lib/release/release-route";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    authorizeReleaseRoute(request);
    const report = await getReleaseReadinessReport();
    return successResponse(
      {
        passed: report.ready,
        checkedAt: report.checkedAt,
        version: report.manifest.version,
        buildSha: report.manifest.buildSha,
        manifestHash: report.manifest.manifestHash,
        gates: report.gates,
      },
      report.ready ? 200 : 409,
      context.requestId,
    );
  });
}
