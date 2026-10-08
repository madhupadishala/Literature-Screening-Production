import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { assessSeriousness, seriousnessAgentEnabled } from "@/lib/ai/seriousness-agent-client";
import { assessSharedPVAgent, PVServiceError } from "@/lib/ai/shared-pv-agent-client";
import { assertSafetyCaseInScope } from "@/lib/safety/common/safety-workspace-scope";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string; agent: string }> }): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(request, NEXUS_MODULES.CASE_PROCESSING, PERMISSIONS.CASE_PROCESS);
    const { caseId, agent } = await context.params;
    await assertSafetyCaseInScope(principal, caseId);
    if (!["seriousness", "drug-role", "causality"].includes(agent)) return Response.json({ error: "Unknown agent." }, { status: 404 });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
    const b = body as Record<string, unknown>;
    // Scope, candidate drug/ownership and gold fields are never accepted from the browser.
    if (Object.keys(b).some(k => !["narrative", "event_terms", "source_type"].includes(k)) || typeof b.narrative !== "string" || !b.narrative.trim() || b.narrative.length > 500_000 || !Array.isArray(b.event_terms) || !b.event_terms.every(x => typeof x === "string") || typeof b.source_type !== "string") throw new Error("Invalid agent input");
    const enabled = agent === "seriousness" ? seriousnessAgentEnabled() : process.env[agent === "drug-role" ? "NEXUS_DRUG_ROLE_ENABLED" : "NEXUS_CAUSALITY_ENABLED"] === "true";
    if (!enabled) return Response.json({ error: "Agent unavailable pending qualification.", route: "hitl" }, { status: 503 });
    // Client workspace is the authority, never a body-supplied client identifier.
    const input = { tenant_id: principal.tenantId, client_id: principal.workspaceId, workspace_id: principal.workspaceId, case_id: caseId, narrative: b.narrative, event_terms: b.event_terms as string[], source_type: b.source_type };
    const result = agent === "seriousness"
      ? await assessSeriousness(input, { bearerToken: process.env.NEXUS_SERIOUSNESS_AGENT_TOKEN || "" })
      : await assessSharedPVAgent(agent as "drug-role" | "causality", input);
    return Response.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PVServiceError) return Response.json({ error: "Agent service unavailable; human review required.", route: "hitl" }, { status: error.statusCode });
    return routeErrorResponse(error);
  }
}
