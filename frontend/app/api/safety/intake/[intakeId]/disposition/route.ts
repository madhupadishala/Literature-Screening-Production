import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  finalizeIntakeDisposition,
  getDispositionWorkspace,
} from "@/lib/safety/disposition/disposition-service";
import {
  INTAKE_DISPOSITION_TYPES,
  type IntakeDispositionRequest,
} from "@/lib/safety/disposition/disposition-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ intakeId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_VIEW,
    );
    const { intakeId } = await context.params;
    const workspace = await getDispositionWorkspace({
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
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.INTAKE,
      PERMISSIONS.INTAKE_PROCESS,
    );
    const { intakeId } = await context.params;
    const body = (await request.json()) as Partial<IntakeDispositionRequest>;

    if (
      typeof body.dispositionType !== "string" ||
      !(INTAKE_DISPOSITION_TYPES as readonly string[]).includes(
        body.dispositionType,
      )
    ) {
      throw new Error("A valid dispositionType is required.");
    }
    if (typeof body.rationale !== "string") {
      throw new Error("rationale is required.");
    }

    if (body.dispositionType === "CREATE_NEXUS_CASE") {
      await requireModulePermission(
        request,
        NEXUS_MODULES.CASE_PROCESSING,
        PERMISSIONS.CASE_CREATE,
      );
    }

    if (body.dispositionType === "EXPORT_EXTERNAL") {
      await requireModulePermission(
        request,
        NEXUS_MODULES.INTAKE,
        PERMISSIONS.INTAKE_EXPORT,
      );
    }

    const workspace = await finalizeIntakeDisposition({
      principal,
      intakeRecordId: intakeId,
      request: {
        dispositionType: body.dispositionType,
        rationale: body.rationale,
        destinationSystem:
          typeof body.destinationSystem === "string"
            ? body.destinationSystem
            : undefined,
        externalCaseReference:
          typeof body.externalCaseReference === "string"
            ? body.externalCaseReference
            : undefined,
        caseKey: typeof body.caseKey === "string" ? body.caseKey : undefined,
        metadata:
          body.metadata &&
          typeof body.metadata === "object" &&
          !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      },
    });

    return Response.json({ success: true, data: workspace }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
