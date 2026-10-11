import { type NextRequest } from "next/server";

import { getPostgresPool } from "@/lib/database/postgres";
import { getReviewWorkspaceDetail } from "@/lib/literature/review/review-workflow-service";
import { proposeSharedAgent } from "@/lib/literature/shared-agents/shared-agent-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
import { routeErrorResponse } from "@/lib/api/route-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit human-requested, review-only suggestions. No review state is mutated. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const principal = await requireWorkspaceModulePermission(
      request, NEXUS_MODULES.LITERATURE, PERMISSIONS.MEDICAL_REVIEW,
    );
    if (process.env.NEXUS_LITERATURE_SHARED_AGENTS_ENABLED !== "true" ||
        process.env.NEXUS_PV_AGENT_DATA_TRANSFER_APPROVED !== "true" ||
        process.env.NEXUS_PV_AGENT_CLIENT_MAPPING_CONFIRMED !== "true") {
      return Response.json({success:false,code:"AGENT_NOT_CONFIGURED"}, {status:503});
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({success:false,code:"INVALID_REQUEST"}, {status:400});
    }
    const args = body as Record<string,unknown>;
    if (typeof args.reviewWorkspaceId !== "string" || !args.reviewWorkspaceId.trim() ||
        !["drug-role","seriousness","causality"].includes(String(args.agent)) ||
        Object.keys(args).some(key=>key!=="reviewWorkspaceId"&&key!=="agent")) {
      return Response.json({success:false,code:"INVALID_REQUEST"}, {status:400});
    }
    const review = await getReviewWorkspaceDetail({
      principal, workspaceId: args.reviewWorkspaceId,
    });
    const source = review.article;
    const narrative = typeof source.sourceText === "string" && source.sourceText.trim()
      ? source.sourceText
      : typeof source.abstract === "string" && source.abstract.trim()
        ? source.abstract
        : "";
    if (!narrative) {
      return Response.json({success:false,code:"SOURCE_TEXT_REQUIRED"}, {status:409});
    }
    const suggestion = await proposeSharedAgent({
      principal,
      agent: args.agent as "drug-role"|"seriousness"|"causality",
      caseId: review.packageId,
      narrative,
      sourceType: "literature",
    });
    // Audit only scoped identifiers and evidence hashes. Never persist source text or a bearer token.
    await getPostgresPool().query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,$4,$5,'LITERATURE_SHARED_AGENT_SUGGESTION',
                 'CLINICAL_HUMAN_REVIEW','success',$6::jsonb)`,
      [
        principal.tenantId, principal.workspaceId, principal.environment,
        NEXUS_MODULES.LITERATURE, principal.userId,
        JSON.stringify({
          agent:suggestion.agent, caseId:review.packageId,
          requestId:suggestion.request_id, auditId:suggestion.audit_id,
          sourceSha256:suggestion.input_sha256, knowledgeVersion:suggestion.knowledge_version,
          reviewRequired:true,
        }),
      ],
    );
    return Response.json({
      success:true,
      data:{...suggestion, decisionStatus:"SUGGESTION_ONLY", humanReviewRequired:true},
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
