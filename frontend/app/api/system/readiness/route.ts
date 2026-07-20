import { NextResponse } from "next/server";
import { runRoute } from "@/lib/enterprise/api-response";
import { validateRuntimeConfiguration } from "@/lib/enterprise/config-validator";
import { registerDefaultDependencyProbes } from "@/lib/enterprise/dependency-probes";
import { healthRegistry } from "@/lib/enterprise/health-registry";
import { validateReleaseEnvironment } from "@/lib/release/environment-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async () => {
    registerDefaultDependencyProbes();

    const [health, configuration] = await Promise.all([
      healthRegistry.run(),
      Promise.resolve(validateRuntimeConfiguration()),
    ]);
    const environment = validateReleaseEnvironment();
    const criticalHealthChecks = health.checks.filter((check) => check.critical);
    const criticalHealthPassed = criticalHealthChecks.every(
      (check) => check.status === "healthy",
    );
    const productionReady =
      configuration.valid && environment.passed && criticalHealthPassed;

    const checks = [
      ...configuration.items.map((item) => ({
        key: `config:${item.name}`,
        label: item.name,
        status: item.passed || !item.critical ? "passed" : "failed",
        critical: item.critical,
        message: item.message,
      })),
      ...environment.items.map((item) => ({
        key: `environment:${item.name}`,
        label: item.name,
        status: item.passed || !item.critical ? "passed" : "failed",
        critical: item.critical,
        message: item.message,
      })),
      ...health.checks.map((check) => ({
        key: `dependency:${check.name}`,
        label: check.name,
        status:
          check.status === "healthy"
            ? "passed"
            : check.critical
              ? "failed"
              : "warning",
        critical: check.critical,
        message: check.message,
        latencyMs: check.latencyMs,
      })),
    ];
    const criticalChecks = checks.filter((check) => check.critical);
    const passedCritical = criticalChecks.filter(
      (check) => check.status === "passed",
    ).length;
    const score =
      criticalChecks.length === 0
        ? 0
        : Math.round((passedCritical / criticalChecks.length) * 100);

    return NextResponse.json(
      {
        success: productionReady,
        readiness: {
          score,
          productionReady,
          generatedAt: new Date().toISOString(),
          checks,
        },
      },
      {
        status: productionReady ? 200 : 503,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  });
}
