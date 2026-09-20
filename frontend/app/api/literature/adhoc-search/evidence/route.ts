import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import {
  createValidationPackagesFromSearch,
  linkValidationPackagesToHits,
} from "@/lib/literature/adhoc-search/validation-package-service";
import { executeProductionSearchToHits } from "@/lib/literature/hits/production-search-to-hits-service";

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
      action?: "VALIDATION_ONLY" | "HANDOFF_WITH_VALIDATION";
    };
    const resultIds = Array.isArray(body.resultIds) ? body.resultIds : [];
    const action = body.action || "HANDOFF_WITH_VALIDATION";

    const validationPackages = await createValidationPackagesFromSearch({
      principal,
      resultIds,
    });

    if (action === "VALIDATION_ONLY") {
      return Response.json(
        {
          success: true,
          data: {
            action,
            status: "completed",
            validationPackageCount: validationPackages.length,
            createdCount: validationPackages.filter((item) => !item.reused).length,
            reusedCount: validationPackages.filter((item) => item.reused).length,
            validationPackages,
          },
        },
        { status: 201 },
      );
    }

    const pendingResultIds = validationPackages
      .filter((item) => !item.handoffPackageId)
      .flatMap((item) => item.sourceResultIds);

    const execution =
      pendingResultIds.length > 0
        ? await executeProductionSearchToHits({
            principal,
            resultIds: pendingResultIds,
          })
        : {
            status: "completed",
            requestedResultCount: 0,
            createdCount: 0,
            hitsCompletedCount: 0,
            manualReviewCount: 0,
            failedCount: 0,
            duplicateMergedCount: 0,
            durationMs: 0,
            packages: [],
          };

    const linkedValidationPackages = await linkValidationPackagesToHits({
      principal,
      validationPackages,
    });

    return Response.json(
      {
        success: true,
        data: {
          action,
          ...execution,
          validationPackageCount: linkedValidationPackages.length,
          validationCreatedCount: linkedValidationPackages.filter((item) => !item.reused).length,
          validationReusedCount: linkedValidationPackages.filter((item) => item.reused).length,
          alreadyHandedOffCount: linkedValidationPackages.filter(
            (item) =>
              item.handoffPackageId &&
              !execution.packages.some(
                (pkg) => pkg.packageId === item.handoffPackageId,
              ),
          ).length,
          validationPackages: linkedValidationPackages,
        },
      },
      { status: execution.status === "partial" ? 207 : 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
