import { NextRequest, NextResponse } from "next/server";

import { evidencePackageGenerator } from "@/lib/evidence/evidence-package-generator";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { routeErrorResponse } from "@/lib/api/route-error";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.INTAKE_INPUT_GENERATE,
    );

    const body = await request.json();
    const { packageId } = body as { packageId?: string };

    if (!packageId) {
      return NextResponse.json(
        { success: false, message: "packageId is required" },
        { status: 400 },
      );
    }

    const evidencePackage = await evidencePackageGenerator.build({
      tenantId: principal.tenantKey,
      workspaceId: principal.workspaceId,
      environment: principal.environment,
      packageId,
    });

    if (!evidencePackage) {
      return NextResponse.json(
        { success: false, message: "Package not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        packageId: evidencePackage.metadata.packageId,
        workflowStage: "HITS",
        data: evidencePackage,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Evidence Package Error", error);
    return routeErrorResponse(error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.INTAKE_INPUT_DOWNLOAD,
    );

    const { searchParams } = new URL(request.url);
    const packageId = searchParams.get("packageId");

    if (!packageId) {
      return NextResponse.json(
        { success: false, message: "packageId is required" },
        { status: 400 },
      );
    }

    const evidencePackage = await evidencePackageGenerator.build({
      tenantId: principal.tenantKey,
      workspaceId: principal.workspaceId,
      environment: principal.environment,
      packageId,
    });

    if (!evidencePackage) {
      return NextResponse.json(
        { success: false, message: "Package not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        packageId: evidencePackage.metadata.packageId,
        workflowStage: "HITS",
        data: evidencePackage,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Evidence Package Error", error);
    return routeErrorResponse(error);
  }
}