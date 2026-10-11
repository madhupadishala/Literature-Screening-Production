import { type NextRequest } from "next/server";

import { routeErrorResponse } from "@/lib/api/route-error";
import { getPostgresPool } from "@/lib/database/postgres";
import { proposeSharedAgent } from "@/lib/literature/shared-agents/shared-agent-service";
import { PV_AGENT_NAMES, type SharedPVAgentName } from "@/lib/literature/shared-agents/shared-agent-contract";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReviewSourceRow {
  package_id: string;
  article_identity: Record<string, unknown>;
}

/** Human-reviewed suggestions only: no clinical state, review or Intake mutation. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request, NEXUS_MODULES.LITERATURE, PERMISSIONS.MEDICAL_REVIEW,
    );
    if (process.env.NEXUS_LITERATURE_SHARED_AGENTS_ENABLED !== "true" ||
        process.env.NEXUS_PV_AGENT_DATA_TRANSFER_APPROVED !== "true" ||
        process.env.NEXUS_PV_AGENT_CLIENT_MAPPING_CONFIRMED !== "true") {
      return Response.json({ success: false, code: "AGENT_NOT_CONFIGURED" }, { status: 503 });
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ success: false, code: "INVALID_REQUEST" }, { status: 400 });
    }
    const fields = body as Record<string, unknown>;
    if (typeof fields.reviewWorkspaceId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(fields.reviewWorkspaceId) ||
        typeof fields.agent !== "string" ||
        !PV_AGENT_NAMES.includes(fields.agent as SharedPVAgentName) ||
        Object.keys(fields).some((key) => !["reviewWorkspaceId", "agent"].includes(key))) {
      return Response.json({ success: false, code: "INVALID_REQUEST" }, { status: 400 });
    }
    const scope = requireSafetyWorkspaceScope(principal);
    const rows = await getPostgresPool().query<ReviewSourceRow>(
      `SELECT package.id AS package_id, package.article_identity
         FROM literature_review_workspaces review
         JOIN literature_packages package
           ON package.id = review.package_id
          AND package.tenant_id = review.tenant_id
        WHERE review.tenant_id = $1
          AND package.workspace_id = $2
          AND package.environment = $3
          AND review.id = $4
        LIMIT 1`,
      [principal.tenantId, scope.workspaceId, scope.environment, fields.reviewWorkspaceId],
    );
    const source = rows.rows[0];
    if (!source) return Response.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const article = source.article_identity;
    const narrative = typeof article?.abstract === "string" ? article.abstract.trim() : "";
    if (!narrative) {
      return Response.json({ success: false, code: "EVIDENCE_UNAVAILABLE" }, { status: 409 });
    }
    const result = await proposeSharedAgent({
      principal,
      agent: fields.agent as SharedPVAgentName,
      caseId: source.package_id,
      narrative,
      sourceType: "literature",
    });
    // Fail closed if application audit persistence fails; never return an unaudited proposal.
    await getPostgresPool().query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,$4,$5,'LITERATURE_SHARED_AGENT_SUGGESTION',
                 'CLINICAL_HUMAN_REVIEW','success',$6::jsonb)`,
      [
        principal.tenantId, scope.workspaceId, scope.environment,
        NEXUS_MODULES.LITERATURE, principal.userId,
        JSON.stringify({
          agent: result.agent, caseId: source.package_id,
          requestId: result.request_id, auditId: result.audit_id,
          sourceSha256: result.input_sha256,
          knowledgeVersion: result.knowledge_version,
          reviewRequired: true,
        }),
      ],
    );
    return Response.json({
      success: true, status: "SUGGESTION_ONLY", reviewRequired: true,
      data: result,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
