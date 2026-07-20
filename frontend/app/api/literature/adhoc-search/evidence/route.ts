import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { createEvidencePackagesFromSearch } from "@/lib/literature/adhoc-search/evidence-package-service";

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

    const packages = await createEvidencePackagesFromSearch({
      principal,
      resultIds: Array.isArray(body.resultIds) ? body.resultIds : [],
    });

    return Response.json(
      {
        success: true,
        data: {
          createdCount: packages.length,
          packages,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
