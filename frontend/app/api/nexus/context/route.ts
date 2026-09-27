import { type NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  createNexusContextToken,
  NEXUS_CONTEXT_COOKIE,
  NEXUS_CONTEXT_MAX_AGE_SECONDS,
} from "@/lib/nexus/context-token";
import { isNexusModuleKey } from "@/lib/nexus/modules";
import {
  evaluateWorkspaceModuleAccess,
  listAccessibleWorkspaces,
} from "@/lib/nexus/workspace-access-service";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  AuthorizationError,
  resolveRequestPrincipal,
} from "@/lib/rbac/request-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await resolveRequestPrincipal(request);
    const workspaces = await listAccessibleWorkspaces({
      tenantId: principal.tenantId,
      userId: principal.userId,
      environment: principal.environment,
    });

    return Response.json({
      success: true,
      data: {
        tenant: {
          id: principal.tenantId,
          key: principal.tenantKey,
        },
        environment: principal.environment,
        workspaces,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type SelectContextBody = {
  workspaceId?: string;
  moduleKey?: string;
  reason?: string;
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await resolveRequestPrincipal(request);
    const body = (await request.json()) as SelectContextBody;
    const workspaceId = body.workspaceId?.trim();
    const moduleKey = body.moduleKey?.trim().toUpperCase();

    if (!workspaceId || !moduleKey || !isNexusModuleKey(moduleKey)) {
      return Response.json(
        { success: false, error: "A valid workspaceId and moduleKey are required." },
        { status: 400 },
      );
    }

    const access = await evaluateWorkspaceModuleAccess({
      tenantId: principal.tenantId,
      userId: principal.userId,
      workspaceId,
      environment: principal.environment,
      moduleKey,
    });

    if (!access.allowed) {
      await getPostgresPool()
        .query(
          `INSERT INTO audit_events (
             tenant_id, workspace_id, actor_id, event_type, event_category,
             outcome, request_id, source_ip, details
           ) VALUES ($1,$2,$3,'WORKSPACE_CONTEXT_DENIED','SECURITY_RBAC','denied',$4,$5,$6::jsonb)`,
          [
            principal.tenantId,
            workspaceId,
            principal.userId,
            request.headers.get("x-request-id")?.trim() || null,
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
            JSON.stringify({
              moduleKey,
              environment: principal.environment,
              reason: access.reason,
            }),
          ],
        )
        .catch(() => undefined);

      throw new AuthorizationError(
        `Workspace/module access denied: ${access.reason}`,
        403,
      );
    }

    const token = createNexusContextToken({
      userId: principal.userId,
      tenantId: principal.tenantId,
      workspaceId,
      environment: principal.environment,
      moduleKey,
    });

    const reason = body.reason?.trim() || "User selected an authorised Nexus workspace context.";

    await getPostgresPool().query(
      `INSERT INTO nexus_workspace_access_history (
         tenant_id, workspace_id, target_user_id, environment, module_key,
         change_type, new_state, changed_by, change_reason
       ) VALUES ($1,$2,$3,$4,$5,'WORKSPACE_CONTEXT_SELECTED',$6::jsonb,$3,$7)`,
      [
        principal.tenantId,
        workspaceId,
        principal.userId,
        principal.environment,
        moduleKey,
        JSON.stringify({
          workspaceKey: access.workspaceKey,
          workspaceRole: access.workspaceRole,
          moduleRoles: access.moduleRoles,
        }),
        reason.length >= 10 ? reason : "Authorised workspace context selection.",
      ],
    );

    const response = NextResponse.json({
      success: true,
      data: {
        tenantId: principal.tenantId,
        tenantKey: principal.tenantKey,
        workspaceId,
        workspaceKey: access.workspaceKey,
        environment: principal.environment,
        moduleKey,
        workspaceRole: access.workspaceRole,
        moduleRoles: access.moduleRoles,
      },
    });

    response.cookies.set(NEXUS_CONTEXT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: NEXUS_CONTEXT_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ success: true, cleared: true });
  response.cookies.set(NEXUS_CONTEXT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
