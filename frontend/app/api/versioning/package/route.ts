import { NextRequest, NextResponse } from "next/server";
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
  const { searchParams } = new URL(request.url);

  const packageId = searchParams.get("packageId") ?? "PKG-LIT-2026-0001";

  const history = getVersionHistory(packageId);

  return NextResponse.json({
    ok: true,
    module: "package-versioning",
    generatedAt: new Date().toISOString(),
    data: history,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const packageId = String(body.packageId ?? "").trim();
  const trigger = String(body.trigger ?? "").trim() as VersionTrigger;
  const workflowStage = String(body.workflowStage ?? "").trim() as VersionWorkflowStage;
  const reason = String(body.reason ?? "").trim();

  if (!packageId) {
    return NextResponse.json(
      {
        ok: false,
        error: "packageId is required.",
      },
      { status: 400 },
    );
  }

  if (!validTriggers.includes(trigger)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Valid version trigger is required.",
      },
      { status: 400 },
    );
  }

  if (!validWorkflowStages.includes(workflowStage)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Valid workflow stage is required.",
      },
      { status: 400 },
    );
  }

  if (!reason) {
    return NextResponse.json(
      {
        ok: false,
        error: "Version reason is mandatory.",
      },
      { status: 400 },
    );
  }

  const version = incrementVersion({
    packageId,
    trigger,
    workflowStage,
    reason,
    createdBy: {
      id: String(body.userId ?? "USR-000"),
      name: String(body.userName ?? "Super User"),
      role: String(body.userRole ?? "SUPER_USER"),
      tenantId: String(body.tenantId ?? "TENANT-CLINIXAI"),
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
}