import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  getTenantEntitlements,
  updateTenantEntitlement,
} from "@/lib/nexus/entitlement-service";
import {
  ENTITLEMENT_STATUSES,
  isNexusEnvironment,
  type EntitlementStatus,
} from "@/lib/nexus/entitlement-types";
import { isNexusModuleKey } from "@/lib/nexus/modules";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ENTITLEMENT_VIEW);
    const entitlements = await getTenantEntitlements(
      principal.tenantId,
      principal.environment,
    );

    return Response.json({
      success: true,
      data: {
        tenantKey: principal.tenantKey,
        environment: principal.environment,
        entitlements,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

interface UpdateBody {
  moduleKey?: unknown;
  status?: unknown;
  environment?: unknown;
  capabilities?: unknown;
  limits?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  reason?: unknown;
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.ENTITLEMENT_MANAGE);
    const body = (await request.json()) as UpdateBody;

    if (typeof body.moduleKey !== "string" || !isNexusModuleKey(body.moduleKey)) {
      throw new Error("A valid moduleKey is required.");
    }

    if (
      typeof body.status !== "string" ||
      !(ENTITLEMENT_STATUSES as readonly string[]).includes(body.status)
    ) {
      throw new Error("A valid entitlement status is required.");
    }

    const rawEnvironment =
      typeof body.environment === "string"
        ? body.environment.trim().toUpperCase()
        : principal.environment;

    if (!isNexusEnvironment(rawEnvironment)) {
      throw new Error("A valid Nexus environment is required.");
    }

    if (typeof body.reason !== "string" || !body.reason.trim()) {
      throw new Error("A change reason is required.");
    }

    const capabilities =
      body.capabilities && typeof body.capabilities === "object" && !Array.isArray(body.capabilities)
        ? (body.capabilities as Record<string, boolean>)
        : {};

    const limits =
      body.limits && typeof body.limits === "object" && !Array.isArray(body.limits)
        ? (body.limits as Record<string, number | string | boolean | null>)
        : {};

    const entitlement = await updateTenantEntitlement({
      tenantId: principal.tenantId,
      environment: rawEnvironment,
      moduleKey: body.moduleKey,
      status: body.status as EntitlementStatus,
      capabilities,
      limits,
      validFrom: typeof body.validFrom === "string" ? body.validFrom : null,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : null,
      changedBy: principal.userId,
      reason: body.reason.trim(),
    });

    return Response.json({
      success: true,
      data: entitlement,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
