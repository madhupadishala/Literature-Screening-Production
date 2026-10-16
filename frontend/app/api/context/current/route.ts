import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { listAccessibleWorkspaces } from "@/lib/nexus/workspace-access-service";
import { AuthorizationError, resolveRequestPrincipal } from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await resolveRequestPrincipal(request);
    const workspaces = await listAccessibleWorkspaces({
      tenantId: principal.tenantId, userId: principal.userId, environment: principal.environment,
    });
    const workspace = workspaces.find(item => item.workspaceId === principal.workspaceId);
    if (!workspace) throw new AuthorizationError("Selected workspace access is no longer active.", 403);
    const enabledModules = workspace.modules.map(item => item.moduleKey);

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
    }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) {
    const response = routeErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    if (response.status >= 500) console.error("Workspace context resolution failed", { code: "CONTEXT_RESOLUTION_FAILED" });
    return response;
  }
}
