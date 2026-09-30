import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getEffectiveEnabledModules } from "@/lib/nexus/entitlement-service";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localhostBypassEnabled(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  return (
    isLocalhost &&
    process.env.LOCAL_AUTH_BYPASS?.trim().toLowerCase() === "true"
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (localhostBypassEnabled(request)) {
      return Response.json({
        success: true,
        data: {
          tenantKey: "demo-tenant",
          environment: "UAT",
          displayName: "Local Development Administrator",
          email: "local.admin@localhost",
          roleKey: "CLINIXAI_SUPER_ADMIN",
          enabledModules: [
            "LITERATURE",
            "INTAKE",
            "CASE_PROCESSING",
            "MEDICAL_REVIEW",
            "SIGNAL_MANAGEMENT",
            "AGGREGATE_REPORTING",
            "GOVERNANCE",
          ],
        },
      });
    }

    const principal = await resolveRequestPrincipal(request);
    const enabledModules = await getEffectiveEnabledModules(
      principal.tenantId,
      principal.environment,
    );

    return Response.json({
      success: true,
      data: {
        tenantKey: principal.tenantKey,
        environment: principal.environment,
        displayName: principal.displayName,
        email: principal.email,
        roleKey: principal.roleKey,
        enabledModules,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
