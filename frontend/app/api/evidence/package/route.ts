import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { evidencePackageGenerator } from "@/lib/evidence/evidence-package-generator";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.EVIDENCE_CREATE,
    );
    const body = await request.json();

    const evidencePackage = await evidencePackageGenerator.build({
      ...body,
      tenantId: principal.tenantId,
      actorId: principal.userId,
      requestId: request.headers.get("x-request-id"),
    });

    return NextResponse.json(
      {
        success: true,
        packageId: evidencePackage.metadata.packageId,
        workflowStage: "HITS",
        data: evidencePackage,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
