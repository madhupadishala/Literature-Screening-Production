import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { listTenantAccess, saveTenantAccess } from "@/lib/rbac/access-governance-service";
import type { SaveTenantAccessRequest } from "@/lib/rbac/access-governance-types";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS, ROLE_KEYS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RBAC_VIEW);
    const records = await listTenantAccess(principal);
    return Response.json({
      success: true,
      data: { records, roles: ROLE_KEYS, permissions: Object.values(PERMISSIONS) },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.RBAC_MANAGE);
    const body = (await request.json()) as SaveTenantAccessRequest;
    const record = await saveTenantAccess({ principal, request: body });
    return Response.json({ success: true, data: record }, { status: body.userId ? 200 : 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
