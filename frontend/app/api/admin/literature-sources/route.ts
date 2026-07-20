import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import {
  listLiteratureSources,
  updateLiteratureSource,
} from "@/lib/literature/adhoc-search/search-repository";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.CONFIG_VIEW,
    );

    const sources = await listLiteratureSources(principal);
    return Response.json({ success: true, data: sources });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.SOURCE_MANAGE,
    );

    const body = (await request.json()) as {
      sourceKey?: string;
      enabled?: boolean;
      maxResults?: number;
      settings?: Record<string, unknown>;
      credentialReference?: string | null;
    };

    const sourceKey = String(body.sourceKey || "").trim().toUpperCase();
    if (!sourceKey) {
      throw new Error("sourceKey is required.");
    }

    const source = await updateLiteratureSource({
      principal,
      sourceKey,
      enabled: body.enabled,
      maxResults: body.maxResults,
      settings: body.settings,
      credentialReference: body.credentialReference,
    });

    return Response.json({ success: true, data: source });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
