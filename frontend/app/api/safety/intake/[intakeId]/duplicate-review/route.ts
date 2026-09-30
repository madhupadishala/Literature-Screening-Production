import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { assertSafetyIntakeInScope } from "@/lib/safety/common/safety-workspace-scope";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import {
  getDuplicateWorkspace,
  runDuplicateSearch,
} from "@/lib/safety/duplicate/duplicate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const { intakeId } = await context.params;
    await assertSafetyIntakeInScope(principal, intakeId);
    const workspace = await getDuplicateWorkspace({
      principal,
      intakeRecordId: intakeId,
    });
    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId } = await context.params;
    await assertSafetyIntakeInScope(principal, intakeId);
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }

    const workspace = await runDuplicateSearch({
      principal,
      intakeRecordId: intakeId,
      reason: body.reason,
    });
    return Response.json({ success: true, data: workspace });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
