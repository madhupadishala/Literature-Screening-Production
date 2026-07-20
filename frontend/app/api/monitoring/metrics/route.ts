import { runRoute } from "@/lib/enterprise/api-response";
import { metrics } from "@/lib/enterprise/metrics";
import { requireInternalMonitoringToken } from "@/lib/enterprise/request-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    requireInternalMonitoringToken(request);

    return new Response(metrics.toPrometheus(), {
      status: 200,
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "x-request-id": context.requestId,
      },
    });
  });
}
