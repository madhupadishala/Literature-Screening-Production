import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createSafetyCaseShell,
  type CreateSafetyCaseInput,
} from "@/lib/safety/common/safety-case-service";
import { listCaseWorklist } from "@/lib/safety/case-processing/case-processing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_VIEW,
    );
    const limit = Number(request.nextUrl.searchParams.get("limit") || "200");
    const records = await listCaseWorklist({ principal, limit });
    return Response.json({ success: true, data: { records } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_CREATE,
    );
    const body = (await request.json()) as CreateSafetyCaseInput;
    const safetyCase = await createSafetyCaseShell({
      principal,
      request: body,
    });

    return Response.json(
      { success: true, data: safetyCase },
      { status: safetyCase.reused ? 200 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
