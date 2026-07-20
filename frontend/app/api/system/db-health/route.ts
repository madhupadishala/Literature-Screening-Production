import { NextResponse } from "next/server";
import { runRoute } from "@/lib/enterprise/api-response";
import { getDatabaseReadiness } from "@/lib/enterprise/database-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return runRoute(request, async () => {
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
  });
}
