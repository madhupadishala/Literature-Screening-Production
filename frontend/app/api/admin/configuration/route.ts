import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  createConfigurationVersion,
  listConfigurationAudit,
  listConfigurationVersions,
} from "@/lib/configuration/repository";
import {
  CONFIGURATION_RESOURCE_TYPES,
  type ConfigurationResourceType,
} from "@/lib/configuration/types";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resourceTypeFrom(value: unknown): ConfigurationResourceType | null {
  const normalized = String(value || "").trim().toUpperCase();
  return CONFIGURATION_RESOURCE_TYPES.includes(
    normalized as ConfigurationResourceType,
  )
    ? (normalized as ConfigurationResourceType)
    : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_VIEW,
    );

    const resourceType = resourceTypeFrom(
      request.nextUrl.searchParams.get("resourceType"),
    );

    const [versions, audit] = await Promise.all([
      listConfigurationVersions({
        principal,
        resourceType,
        limit: Number(request.nextUrl.searchParams.get("limit") || 100),
      }),
      principal.hasPermission(PERMISSIONS.AUDIT_VIEW)
        ? listConfigurationAudit({ principal, limit: 50 })
        : Promise.resolve([]),
    ]);

    return Response.json({
      success: true,
      data: {
        versions,
        audit,
        permissions: {
          upload: principal.hasPermission(PERMISSIONS.CONFIG_UPLOAD),
          create: principal.hasPermission(PERMISSIONS.CONFIG_CREATE),
          validate: principal.hasPermission(PERMISSIONS.CONFIG_VALIDATE),
          approve: principal.hasPermission(PERMISSIONS.CONFIG_APPROVE),
          activate: principal.hasPermission(PERMISSIONS.CONFIG_ACTIVATE),
          retire: principal.hasPermission(PERMISSIONS.CONFIG_RETIRE),
          manageSources: principal.hasPermission(PERMISSIONS.SOURCE_MANAGE),
        },
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_CREATE,
    );

    const body = (await request.json()) as Record<string, unknown>;
    const resourceType = resourceTypeFrom(body.resourceType);

    if (!resourceType) {
      throw new Error("A valid configuration resourceType is required.");
    }

    const configKey = String(body.configKey || "").trim();
    const displayName = String(body.displayName || "").trim();
    const versionLabel = String(body.versionLabel || "").trim();

    if (!configKey || !displayName || !versionLabel) {
      throw new Error(
        "configKey, displayName, and versionLabel are required.",
      );
    }

    const version = await createConfigurationVersion({
      principal,
      resourceType,
      configKey,
      displayName,
      description: String(body.description || "").trim() || undefined,
      versionLabel,
      effectiveFrom: String(body.effectiveFrom || "").trim() || null,
      effectiveTo: String(body.effectiveTo || "").trim() || null,
      payload: body.payload ?? {},
      changeReason: String(body.changeReason || "").trim() || undefined,
    });

    return Response.json(
      {
        success: true,
        data: version,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
