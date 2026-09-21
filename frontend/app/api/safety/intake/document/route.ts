import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { ingestDocumentIntake } from "@/lib/safety/intake/intake-source-service";
import type { DocumentIntakeSubmission } from "@/lib/safety/intake/source-submission-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocumentIntakeBody extends DocumentIntakeSubmission {
  reason: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_CREATE,
    );
    const body = (await request.json()) as DocumentIntakeBody;

    if (typeof body.reason !== "string") {
      throw new Error("reason is required.");
    }

    const result = await ingestDocumentIntake({
      principal,
      submission: body,
      reason: body.reason,
    });

    return Response.json(
      { success: true, data: result },
      { status: result.intake.reused ? 200 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
