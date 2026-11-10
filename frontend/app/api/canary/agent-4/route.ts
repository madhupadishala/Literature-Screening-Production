import { type NextRequest } from "next/server";
import { getGlobalCanary } from "@/lib/canary/agent-4-canary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/canary/agent-4
 * Returns health status of agent-4 canary for monitoring/alerting
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const canary = getGlobalCanary();
    const health = canary.getHealth();

    return Response.json({
      success: true,
      agentId: 'agent-4-screening',
      health,
      timestamp: new Date().toISOString(),
    }, { status: health.status === 'UNHEALTHY' ? 503 : 200 });
  } catch (error) {
    return Response.json({
      success: false,
      agentId: 'agent-4-screening',
      health: {
        status: 'UNHEALTHY',
        error: error instanceof Error ? error.message : String(error),
      },
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}

/**
 * POST /api/canary/agent-4
 * Triggers a manual canary run (for testing)
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const canary = getGlobalCanary();
    const results = await canary.runOnce();
    const alerts = canary.checkAlerts();

    return Response.json({
      success: true,
      results: results.map(r => ({
        name: r.name,
        passed: r.passed,
        latencyMs: r.latencyMs,
        error: r.error,
      })),
      alerts: alerts.alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}