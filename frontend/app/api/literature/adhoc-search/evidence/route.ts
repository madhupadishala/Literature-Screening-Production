import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { executeSearchToHits } from "@/lib/literature/hits/search-to-hits-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(
      request,
      PERMISSIONS.EVIDENCE_CREATE,
    );

    const body = (await request.json()) as {
      resultIds?: string[];
    };

    const execution = await executeSearchToHits({
      principal,
      resultIds: Array.isArray(body.resultIds) ? body.resultIds : [],
    });

    return Response.json(
      {
        success: true,
        data: execution,
      },
      { status: execution.status === "partial" ? 207 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
