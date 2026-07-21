import { type NextRequest, NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { registerDefaultDependencyProbes } from "@/lib/enterprise/dependency-probes";
import { healthRegistry } from "@/lib/enterprise/health-registry";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    registerDefaultDependencyProbes();
    const report = await healthRegistry.run();

    const services = report.checks.map((check) => ({
      serviceId: check.name,
      component: componentFor(check.name),
      status: check.status,
      critical: check.critical,
      message: check.message,
      checkedAt: check.checkedAt,
      latencyMs: check.latencyMs,
      details: check.details,
    }));

    const summary = {
      total: services.length,
      healthy: services.filter((service) => service.status === "healthy").length,
      degraded: services.filter((service) => service.status === "degraded").length,
      unhealthy: services.filter((service) => service.status === "unhealthy").length,
      criticalUnhealthy: services.filter(
        (service) => service.critical && service.status !== "healthy",
      ).length,
    };

    return NextResponse.json(
      {
        overall: report.status,
        uptimeSeconds: report.uptimeSeconds,
        generatedAt: report.checkedAt,
        services,
        summary,
      },
      {
        status: summary.criticalUnhealthy > 0 ? 503 : 200,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

function componentFor(name: string): string {
  if (name === "ai-provider") return "ai";
  if (name === "knowledge-service") return "knowledge";
  if (name === "vector-service") return "vector";
  if (name === "evidence-store") return "storage";
  if (name === "database") return "database";
  return "application";
}
