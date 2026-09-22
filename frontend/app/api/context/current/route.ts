import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getEffectiveEnabledModules } from "@/lib/nexus/entitlement-service";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
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
