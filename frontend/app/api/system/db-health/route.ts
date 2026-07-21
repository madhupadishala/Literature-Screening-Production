import { type NextRequest, NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getDatabaseReadiness } from "@/lib/enterprise/database-readiness";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, PERMISSIONS.RELIABILITY_VIEW);
    const report = await getDatabaseReadiness();
    const connected = report.connectivityVerified;
    const releaseReady = report.status === "healthy";

    return NextResponse.json(
      {
        success: releaseReady,
        database: {
          provider: report.provider,
          configured: report.configured,
          connected,
          connectivityVerified: report.connectivityVerified,
          releaseReady,
          message: report.message,
          checkedAt: report.checkedAt,
          details: report.details,
        },
        migrations: report.migrations,
        generatedAt: report.checkedAt,
      },
      {
        status: releaseReady ? 200 : 503,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
