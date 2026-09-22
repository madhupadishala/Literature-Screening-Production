import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
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
import { PLATFORM_PERMISSIONS } from "@/lib/nexus/platform-permissions";
import { requirePlatformPermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveTargetTenant(tenantKey: string) {
  const result = await getPostgresPool().query<{
    id: string;
    tenant_key: string;
    display_name: string;
    status: string;
  }>(
    `SELECT id, tenant_key, display_name, status
       FROM tenants
      WHERE tenant_key = $1
      LIMIT 1`,
    [tenantKey],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Target tenant not found.");
  return row;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePlatformPermission(
      request,
      PLATFORM_PERMISSIONS.ENTITLEMENT_VIEW,
    );

    const targetTenantKey =
      request.nextUrl.searchParams.get("tenantKey")?.trim() || principal.tenantKey;
    const rawEnvironment =
      request.nextUrl.searchParams.get("environment")?.trim().toUpperCase() ||
      principal.environment;

    if (!isNexusEnvironment(rawEnvironment)) {
      throw new Error("A valid Nexus environment is required.");
    }

    const tenant = await resolveTargetTenant(targetTenantKey);
    const entitlements = await getTenantEntitlements(tenant.id, rawEnvironment);

    return Response.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          tenantKey: tenant.tenant_key,
          displayName: tenant.display_name,
          status: tenant.status,
        },
        environment: rawEnvironment,
        entitlements,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

interface UpdateBody {
  tenantKey?: unknown;
  moduleKey?: unknown;
  status?: unknown;
  environment?: unknown;
  capabilities?: unknown;
  limits?: unknown;
  validFrom?: unknown;
  validUntil?: unknown;
  reason?: unknown;
}

function readCapabilities(value: unknown): Record<string, boolean> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("capabilities must be an object of boolean values.");
  }

  const entries = Object.entries(value);
  if (!entries.every(([, item]) => typeof item === "boolean")) {
    throw new Error("capabilities must contain only boolean values.");
  }

  return Object.fromEntries(entries) as Record<string, boolean>;
}

function readLimits(
  value: unknown,
): Record<string, number | string | boolean | null> {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("limits must be an object.");
  }

  const entries = Object.entries(value);
  if (
    !entries.every(([, item]) =>
      item === null || ["number", "string", "boolean"].includes(typeof item),
    )
  ) {
    throw new Error("limits may contain only string, number, boolean or null values.");
  }

  return Object.fromEntries(entries) as Record<
    string,
    number | string | boolean | null
  >;
}

export async function PUT(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePlatformPermission(
      request,
      PLATFORM_PERMISSIONS.ENTITLEMENT_MANAGE,
    );
    const body = (await request.json()) as UpdateBody;

    if (typeof body.tenantKey !== "string" || !body.tenantKey.trim()) {
      throw new Error("A target tenantKey is required.");
    }
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
    if (typeof body.reason !== "string" || body.reason.trim().length < 10) {
      throw new Error("An entitlement-change reason of at least 10 characters is required.");
    }

    const tenant = await resolveTargetTenant(body.tenantKey.trim());
    const entitlement = await updateTenantEntitlement({
      tenantId: tenant.id,
      environment: rawEnvironment,
      moduleKey: body.moduleKey,
      status: body.status as EntitlementStatus,
      capabilities: readCapabilities(body.capabilities),
      limits: readLimits(body.limits),
      validFrom: typeof body.validFrom === "string" ? body.validFrom : null,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : null,
      changedBy: principal.userId,
      reason: body.reason.trim(),
    });

    return Response.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          tenantKey: tenant.tenant_key,
          displayName: tenant.display_name,
          status: tenant.status,
        },
        entitlement,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
