import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await resolveRequestPrincipal(request);

    return Response.json({
      success: true,
      data: {
        tenantKey: principal.tenantKey,
        displayName: principal.displayName,
        email: principal.email,
        roleKey: principal.roleKey,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
