import { NextRequest, NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getLatestVersion,
  getVersionHistory,
  incrementVersion,
} from "@/lib/versioning/version-store";
import type {
  VersionTrigger,
  VersionWorkflowStage,
} from "@/lib/versioning/version-types";

const validTriggers: VersionTrigger[] = [
  "INITIAL_CREATE",
  "UNLOCK",
  "OVERRIDE",
  "ROUTE_BACK",
  "QC_CORRECTION",
  "MANUAL_UPDATE",
  "SYSTEM_UPDATE",
];

const validWorkflowStages: VersionWorkflowStage[] = [
  "HITS",
  "SCREENING",
  "LOCKED",
  "INTAKE",
  "QC",
  "COMPLETED",
];

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, PERMISSIONS.PACKAGE_VIEW);
    const packageId = request.nextUrl.searchParams.get("packageId");

    if (!packageId) {
      return NextResponse.json(
        { ok: false, error: "packageId is required." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      module: "package-versioning",
      generatedAt: new Date().toISOString(),
      data: getVersionHistory(packageId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.VERSIONING_MANAGE,
    );
    const body = await request.json();

    const packageId = String(body.packageId ?? "").trim();
    const trigger = String(body.trigger ?? "").trim() as VersionTrigger;
    const workflowStage = String(body.workflowStage ?? "").trim() as VersionWorkflowStage;
    const reason = String(body.reason ?? "").trim();

    if (!packageId) throw new Error("packageId is required.");
    if (!validTriggers.includes(trigger)) {
      throw new Error("Valid version trigger is required.");
    }
    if (!validWorkflowStages.includes(workflowStage)) {
      throw new Error("Valid workflow stage is required.");
    }
    if (!reason) throw new Error("Version reason is mandatory.");

    const version = incrementVersion({
      packageId,
      trigger,
      workflowStage,
      reason,
      createdBy: {
        id: principal.userId,
        name: principal.displayName,
        role: principal.roleKey,
        tenantId: principal.tenantId,
      },
      changes: Array.isArray(body.changes) ? body.changes : [],
    });

    return NextResponse.json({
      ok: true,
      module: "package-versioning",
      generatedAt: new Date().toISOString(),
      latestVersion: getLatestVersion(packageId),
      data: version,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
