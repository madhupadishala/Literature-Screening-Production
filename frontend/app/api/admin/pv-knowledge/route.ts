import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import agentPacks from "@/lib/knowledge/draft-pv-eight-packs.json";
import crossCutting from "@/lib/knowledge/draft-pv-cross-cutting.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint deliberately exposes immutable DRAFT material only.
// Approval, activation and client-specific clinical use are not implemented here.
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    const packs = agentPacks.knowledge_packs.map((pack) => ({
      id: pack.pack_id,
      version: pack.version,
      status: pack.approval_state,
      rules: pack.rules,
    }));
    const cross = {
      id: crossCutting.pack_id,
      version: crossCutting.version,
      status: crossCutting.approval_state,
      rules: crossCutting.rules,
    };
    return Response.json({ success: true, data: {
      packs: [...packs, cross],
      sources: agentPacks.sources,
      status: "DRAFT_REQUIRES_PV_QA_APPROVAL",
      liveKnowledgeResolverConnected: false,
      agentClinicalUseAuthorized: false
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
