import { successResponse } from "@/lib/enterprise/api-response";
import { getRuntimeConfig } from "@/lib/enterprise/environment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const config = getRuntimeConfig();

  return successResponse({
    status: "alive",
    service: config.appName,
    version: config.appVersion,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
