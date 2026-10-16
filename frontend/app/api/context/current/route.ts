import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { listAccessibleWorkspaces } from "@/lib/nexus/workspace-access-service";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await resolveRequestPrincipal(request);
    const workspaces = await listAccessibleWorkspaces({
      tenantId: principal.tenantId, userId: principal.userId, environment: principal.environment,
    });
    const workspace = workspaces.find(item => item.workspaceId === principal.workspaceId);
    const enabledModules = workspace?.modules.map(item => item.moduleKey) ?? [];

    return Response.json({
      success: true,
      data: {
        tenantKey: principal.tenantKey,
        tenantId: principal.tenantId,
        workspaceId: principal.workspaceId,
        workspaceName: workspace?.displayName,
        moduleKey: principal.moduleKey,
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
