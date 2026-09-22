import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { importLiteratureIntakeExport } from "@/lib/safety/common/safety-backbone-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportBody {
  exportId?: unknown;
  reason?: unknown;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_CREATE,
    );
    const body = (await request.json()) as ImportBody;

    if (typeof body.exportId !== "string" || !body.exportId.trim()) {
      throw new Error("exportId is required.");
    }
    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }

    const imported = await importLiteratureIntakeExport({
      principal,
      exportId: body.exportId,
      reason: body.reason,
    });

    return Response.json(
      { success: true, data: imported },
      { status: imported.reused ? 200 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
