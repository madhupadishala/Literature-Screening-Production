import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getEffectiveEnabledModules } from "@/lib/nexus/entitlement-service";
import { localAuthBypassEnabled } from "@/lib/auth/local-auth-bypass";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (localAuthBypassEnabled(request)) {
      return Response.json({
        success: true,
        data: {
          tenantKey: "demo-tenant",
          environment: "UAT",
          displayName: "Local Development Administrator",
          email: "local.admin@localhost",
          roleKey: "CLINIXAI_SUPER_ADMIN",
          enabledModules: Object.values(NEXUS_MODULES),
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
