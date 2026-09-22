import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { requireModulePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  createSafetyCaseVersion,
  type CaseVersionType,
} from "@/lib/safety/common/case-version-service";
import type { E2BR3CasePayload } from "@/lib/safety/common/safety-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VersionBody {
  versionType?: unknown;
  payload?: unknown;
  reason?: unknown;
}

const VERSION_TYPES: readonly CaseVersionType[] = [
  "INITIAL",
  "FOLLOW_UP",
  "CORRECTION",
  "NULLIFICATION",
];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  try {
    const principal = await requireModulePermission(
      request,
      NEXUS_MODULES.CASE_PROCESSING,
      PERMISSIONS.CASE_PROCESS,
    );
    const { caseId } = await context.params;
    const body = (await request.json()) as VersionBody;

    if (
      typeof body.versionType !== "string" ||
      !(VERSION_TYPES as readonly string[]).includes(body.versionType)
    ) {
      throw new Error("A valid case versionType is required.");
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      throw new Error("A case payload object is required.");
    }
    if (typeof body.reason !== "string") {
      throw new Error("A case version reason is required.");
    }

    const version = await createSafetyCaseVersion({
      principal,
      caseId,
      versionType: body.versionType as CaseVersionType,
      payload: body.payload as E2BR3CasePayload,
      reason: body.reason,
    });

    return Response.json({ success: true, data: version }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
