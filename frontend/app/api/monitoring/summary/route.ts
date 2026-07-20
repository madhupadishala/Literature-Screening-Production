import { runRoute, successResponse } from "@/lib/enterprise/api-response";
import { getMonitoringSummary } from "@/lib/enterprise/monitoring-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    const summary = await getMonitoringSummary();
    return successResponse(summary, 200, context.requestId);
  });
}
