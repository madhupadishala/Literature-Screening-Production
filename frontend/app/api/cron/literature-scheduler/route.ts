import { type NextRequest } from "next/server";

import { executeDueScheduledSearches } from "@/lib/literature/scheduler/scheduler-service";
import { runReliabilitySweepsForAllTenants } from "@/lib/enterprise/reliability-sweep-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return Response.json(
      { success: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json(
      { success: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  const [scheduler, reliability] = await Promise.all([
    executeDueScheduledSearches(),
    runReliabilitySweepsForAllTenants(),
  ]);
  return Response.json(
    { success: true, data: { scheduler, reliability } },
    { headers: { "cache-control": "no-store" } },
  );
}
