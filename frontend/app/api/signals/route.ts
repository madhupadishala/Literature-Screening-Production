import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { createSignal, listSignals } from "@/lib/signals/signal-service";
import type { CreateSignalRequest } from "@/lib/signals/signal-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SIGNAL_MANAGEMENT,
      PERMISSIONS.SIGNAL_VIEW,
    );
    const limit = Number(request.nextUrl.searchParams.get("limit") || "100");
    return Response.json({ success: true, data: { records: await listSignals({ principal, limit }) } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.SIGNAL_MANAGEMENT,
      PERMISSIONS.SIGNAL_CREATE,
    );
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid signal request body.");
    }
    const signal = await createSignal({ principal, request: body as CreateSignalRequest });
    return Response.json({ success: true, data: signal }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
