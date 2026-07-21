import { runRoute, successResponse } from "@/lib/enterprise/api-response";
import { registerDefaultDependencyProbes } from "@/lib/enterprise/dependency-probes";
import { healthRegistry } from "@/lib/enterprise/health-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async (context) => {
    registerDefaultDependencyProbes();
    const report = await healthRegistry.run();
    return successResponse(
      {
        service: report.service,
        version: report.version,
        environment: report.environment,
        status: report.status,
        checkedAt: report.checkedAt,
        uptimeSeconds: report.uptimeSeconds,
        checks: report.checks.map((check) => ({
          name: check.name,
          status: check.status,
          critical: check.critical,
          latencyMs: check.latencyMs,
          checkedAt: check.checkedAt,
        })),
      },
      report.status === "unhealthy" ? 503 : 200,
      context.requestId,
    );
  });
}
