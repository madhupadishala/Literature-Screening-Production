import { type NextRequest, NextResponse } from "next/server";

import { requireIdentitySession, resolveTenantForIdentity } from "@/lib/auth/identity-principal";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { isNexusEnvironment, type NexusEnvironment } from "@/lib/nexus/entitlement-types";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeEnvironment(value: string | null | undefined): NexusEnvironment | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && isNexusEnvironment(normalized) ? normalized : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const identity = await requireIdentitySession(request);
    const tenantId = request.nextUrl.searchParams.get("tenantId")?.trim();
    const environment =
      normalizeEnvironment(request.nextUrl.searchParams.get("environment")) ?? "PROD";

    if (!tenantId || !UUID_PATTERN.test(tenantId)) {
      return Response.json(
        { success: false, error: "A valid tenantId is required before requesting client workspaces." },
        { status: 400 },
      );
    }

    const tenant = await resolveTenantForIdentity({ session: identity, tenantId });
    const workspaces = await listAccessibleWorkspaces({
      tenantId: tenant.tenantId,
      userId: identity.userId,
      environment,
    });

    return Response.json({
      success: true,
      data: {
        tenant: { id: tenant.tenantId, key: tenant.tenantKey },
        environment,
        workspaces,
        next: "SELECT_WORKSPACE_AND_MODULE",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

type SelectContextBody = {
  tenantId?: string;
  workspaceId?: string;
  environment?: string;
  moduleKey?: string;
  reason?: string;
};

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const identity = await requireIdentitySession(request);
    let body: SelectContextBody;
    try {
      body = (await request.json()) as SelectContextBody;
    } catch {
      return Response.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
    }

    if (
      (body.tenantId !== undefined && typeof body.tenantId !== "string") ||
      (body.workspaceId !== undefined && typeof body.workspaceId !== "string") ||
      (body.environment !== undefined && typeof body.environment !== "string") ||
      (body.moduleKey !== undefined && typeof body.moduleKey !== "string") ||
      (body.reason !== undefined && typeof body.reason !== "string")
    ) {
      return Response.json(
        { success: false, error: "Context selector fields must be strings." },
        { status: 400 },
      );
    }

    const tenantId = body.tenantId?.trim();
    const workspaceId = body.workspaceId?.trim();
    const environment = normalizeEnvironment(body.environment);
    const moduleKey = body.moduleKey?.trim().toUpperCase();

    if (
      !tenantId ||
      !workspaceId ||
      !UUID_PATTERN.test(tenantId) ||
      !UUID_PATTERN.test(workspaceId) ||
      !environment ||
      !moduleKey ||
      !isNexusModuleKey(moduleKey)
    ) {
      return Response.json(
        {
          success: false,
          error: "tenantId, workspaceId, a valid environment and moduleKey are required.",
        },
        { status: 400 },
      );
    }

    const tenant = await resolveTenantForIdentity({ session: identity, tenantId });
    const access = await evaluateWorkspaceModuleAccess({
      tenantId: tenant.tenantId,
      userId: identity.userId,
      workspaceId,
      environment,
      moduleKey,
    });

    if (!access.allowed) {
      await getPostgresPool()
        .query(
          `INSERT INTO audit_events (
             tenant_id, workspace_id, environment, module_key, actor_id,
             event_type, event_category, outcome, request_id, source_ip, details
           ) VALUES ($1,$2,$3,$4,$5,'WORKSPACE_CONTEXT_DENIED','SECURITY_RBAC','denied',$6,$7,$8::jsonb)`,
          [
            tenant.tenantId,
            access.reason === "WORKSPACE_NOT_FOUND" ? null : workspaceId,
            environment,
            moduleKey,
            identity.userId,
            request.headers.get("x-request-id")?.trim() || null,
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
            JSON.stringify({ reason: access.reason, requestedWorkspaceId: workspaceId }),
          ],
        )
        .catch(() => undefined);

      return Response.json(
        { success: false, error: `Workspace/module access denied: ${access.reason}` },
        { status: 403 },
      );
    }

    const token = createNexusContextToken({
      sessionId: identity.sessionId,
      userId: identity.userId,
      tenantId: tenant.tenantId,
      workspaceId,
      environment,
      moduleKey,
      sessionExpiresAt: identity.expiresAt,
    });

    const reason = body.reason?.trim() || "User selected an authorized Nexus workspace context.";

    await getPostgresPool().query(
      `INSERT INTO nexus_workspace_access_history (
         tenant_id, workspace_id, target_user_id, environment, module_key,
         change_type, new_state, changed_by, change_reason
       ) VALUES ($1,$2,$3,$4,$5,'WORKSPACE_CONTEXT_SELECTED',$6::jsonb,$3,$7)`,
      [
        tenant.tenantId,
        workspaceId,
        identity.userId,
        environment,
        moduleKey,
        JSON.stringify({
          workspaceKey: access.workspaceKey,
          workspaceRole: access.workspaceRole,
          moduleRoles: access.moduleRoles,
          identitySessionId: identity.sessionId,
        }),
        reason.length >= 10 ? reason : "Authorized workspace context selection.",
      ],
    );

    const response = NextResponse.json({
      success: true,
      data: {
        tenantId: tenant.tenantId,
        tenantKey: tenant.tenantKey,
        workspaceId,
        workspaceKey: access.workspaceKey,
        environment,
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
