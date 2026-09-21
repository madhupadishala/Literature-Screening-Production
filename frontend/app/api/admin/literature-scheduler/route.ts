import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import {
  executeDueScheduledSearches,
  listScheduledSearchOperations,
} from "@/lib/literature/scheduler/scheduler-service";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_VIEW,
    );
    const operations = await listScheduledSearchOperations({
      tenantId: principal.tenantId,
      limit: Number(request.nextUrl.searchParams.get("limit") || 50),
    });
    return Response.json({ success: true, data: operations });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SUPER_USER_CONSOLE_MANAGE,
    );
    const result = await executeDueScheduledSearches({
      tenantId: principal.tenantId,
      now: new Date(),
    });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
