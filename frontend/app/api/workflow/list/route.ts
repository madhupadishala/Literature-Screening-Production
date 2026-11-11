import { NextRequest, NextResponse } from "next/server";
import { getPostgresPool } from "@/lib/database/postgres";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { routeErrorResponse } from "@/lib/api/route-error";

interface WorkflowListItem {
  id: string;
  articleTitle: string;
  source: string;
  product: string;
  country: string;
  stage: string;
  status: string;
  priority: string;
  seriousness: string[];
  assignedTo: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  hasOverride: boolean;
  isExpedited: boolean;
}

function stageFor(status: string): string {
  if (status.startsWith("HITS_")) return "HITS";
  if (status.startsWith("SCREENING_")) return "SCREENING";
  if (status === "INTAKE_INPUT_CREATED") return "INTAKE";
  return "HITS";
}

function statusFor(status: string): string {
  if (status.endsWith("_RUNNING")) return "IN_PROGRESS";
  if (status === "INTAKE_INPUT_CREATED") return "COMPLETED";
  return "NOT_STARTED";
}

function seriousnessFor(value: unknown): string[] {
  if (value === "Death") return ["Death"];
  if (value === "Life-threatening") return ["Life-threatening"];
  if (value === "Serious") return ["Other medically important condition"];
  return ["Non-serious"];
}

function priorityFor(seriousness: string[]): string {
  if (seriousness.includes("Death") || seriousness.includes("Life-threatening")) {
    return "CRITICAL";
  }
  if (!seriousness.includes("Non-serious")) return "HIGH";
  return "MEDIUM";
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request,
      NEXUS_MODULES.LITERATURE,
      PERMISSIONS.PACKAGE_ACTION_EXECUTE,
    );

    const pool = getPostgresPool();
    const tenantId = principal.tenantKey;
    const workspaceId = principal.workspaceId;
    const environment = principal.environment;

    // Resolve tenant UUID
    const tenantResult = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1",
      [tenantId],
    );
    const tenantUuid = tenantResult.rows[0]?.id;
    if (!tenantUuid) {
      return NextResponse.json({ ok: true, module: "literature-screening", generatedAt: new Date().toISOString(), summary: { total: 0, hits: 0, screening: 0, intake: 0, qc: 0, completed: 0, escalated: 0, overrides: 0, expedited: 0 }, items: [] });
    }

    // Query literature_packages with latest hits/screening results
    const result = await pool.query(
      `SELECT
         lp.id,
         lp.package_key,
         lp.article_identity,
         lp.status as package_status,
         lp.created_at,
         lp.updated_at,
         lws.workflow_state,
         hr.result_payload as hits_payload,
         sr.decision as screening_decision,
         sr.result_payload as screening_payload,
         sr.confidence as screening_confidence
       FROM literature_packages lp
       LEFT JOIN literature_workflow_state lws ON lws.package_id = lp.id
       LEFT JOIN LATERAL (
         SELECT result_payload FROM hits_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) hr ON true
       LEFT JOIN LATERAL (
         SELECT decision, result_payload, confidence FROM screening_results
         WHERE tenant_id = lp.tenant_id AND package_id = lp.id
         ORDER BY result_version DESC LIMIT 1
       ) sr ON true
       WHERE lp.tenant_id = $1
         AND lp.workspace_id = $2
         AND lp.environment = $3
       ORDER BY lp.updated_at DESC
       LIMIT 100`,
      [tenantUuid, workspaceId, environment],
    );

    const items: WorkflowListItem[] = result.rows.map((row) => {
      const articleIdentity = row.article_identity as Record<string, unknown> || {};
      const hitsPayload = row.hits_payload as Record<string, unknown> | null;
      const screeningPayload = row.screening_payload as Record<string, unknown> | null;

      const latestHit = hitsPayload?.hits ? (hitsPayload.hits as unknown[])[0] as Record<string, unknown> : null;
      const seriousness = seriousnessFor(screeningPayload?.seriousness);

      return {
        id: row.package_key,
        articleTitle: String(articleIdentity.title || row.package_key),
        source: String(articleIdentity.source || "PubMed"),
        product: String(latestHit?.product_name || screeningPayload?.company_suspect_drugs || "Not identified"),
        country: String(latestHit?.country_of_interest || articleIdentity.country || "Not identified"),
        stage: stageFor(row.workflow_state || row.package_status),
        status: statusFor(row.workflow_state || row.package_status),
        priority: priorityFor(seriousness),
        seriousness,
        assignedTo: "Unassigned",
        dueDate: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        hasOverride: false,
        isExpedited: seriousness.some((s) => s !== "Non-serious"),
      };
    });

    const summary = {
      total: items.length,
      hits: items.filter((i) => i.stage === "HITS").length,
      screening: items.filter((i) => i.stage === "SCREENING").length,
      intake: items.filter((i) => i.stage === "INTAKE").length,
      qc: 0,
      completed: items.filter((i) => i.status === "COMPLETED").length,
      escalated: items.filter((i) => i.status === "ESCALATED").length,
      overrides: items.filter((i) => i.hasOverride).length,
      expedited: items.filter((i) => i.isExpedited).length,
    };

    return NextResponse.json({
      ok: true,
      module: "literature-screening",
      generatedAt: new Date().toISOString(),
      summary,
      items,
    });
  } catch (error) {
    console.error("[api/workflow/list] Failed:", error);
    return routeErrorResponse(error);
  }
}