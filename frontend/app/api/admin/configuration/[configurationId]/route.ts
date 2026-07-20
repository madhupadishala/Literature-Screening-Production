import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  getConfigurationVersion,
  transitionConfigurationVersion,
} from "@/lib/configuration/repository";
import { PERMISSIONS, type Permission } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "VALIDATE" | "APPROVE" | "ACTIVATE" | "RETIRE" | "REJECT";

function permissionFor(action: Action): Permission {
  if (action === "VALIDATE") return PERMISSIONS.CONFIG_VALIDATE;
  if (action === "APPROVE" || action === "REJECT") {
    return PERMISSIONS.CONFIG_APPROVE;
  }
  if (action === "ACTIVATE") return PERMISSIONS.CONFIG_ACTIVATE;
  return PERMISSIONS.CONFIG_RETIRE;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ configurationId: string }> },
): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_VIEW,
    );
    const { configurationId } = await context.params;

    const version = await getConfigurationVersion({
      principal,
      versionId: configurationId,
    });

    if (!version) {
      return Response.json(
        { success: false, error: "Configuration version was not found." },
        { status: 404 },
      );
    }

    return Response.json({ success: true, data: version });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ configurationId: string }> },
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      action?: Action;
      reason?: string;
    };

    const action = String(body.action || "").toUpperCase() as Action;
    if (
      !["VALIDATE", "APPROVE", "ACTIVATE", "RETIRE", "REJECT"].includes(
        action,
      )
    ) {
      throw new Error("A valid configuration lifecycle action is required.");
    }

    const reason = String(body.reason || "").trim();
    if (reason.length < 10) {
      throw new Error(
        "A controlled lifecycle action requires a reason of at least 10 characters.",
      );
    }

    const principal = await requirePermission(
      request,
      permissionFor(action),
    );
    const { configurationId } = await context.params;

    const version = await transitionConfigurationVersion({
      principal,
      versionId: configurationId,
      action,
      reason,
    });

    return Response.json({ success: true, data: version });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
