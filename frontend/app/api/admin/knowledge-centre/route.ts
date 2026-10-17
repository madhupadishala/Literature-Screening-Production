import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { requirePermission } from "@/lib/rbac/guard";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listConfigurationVersions } from "@/lib/configuration/repository";
import agentPacks from "@/lib/knowledge/draft-pv-eight-packs.json";
import crossCutting from "@/lib/knowledge/draft-pv-cross-cutting.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  { id: "REGULATORY", name: "Regulatory Knowledge", resourceTypes: [] },
  { id: "CLINICAL", name: "Medical & Clinical Knowledge", resourceTypes: ["CAUSALITY_METHOD"] },
  { id: "PRODUCT", name: "Product & Labeling", resourceTypes: ["PRODUCT_MASTER", "LABEL_REFERENCE"] },
  { id: "CLIENT", name: "Client SOPs & Policies", resourceTypes: ["CLIENT_GUIDELINE"] },
  { id: "TERMINOLOGY", name: "Terminology & Dictionaries", resourceTypes: [] },
  { id: "DECISIONS", name: "PV Decision Rules", resourceTypes: [] },
  { id: "LITERATURE", name: "Scientific Literature", resourceTypes: [] },
  { id: "GOVERNANCE", name: "Knowledge Governance", resourceTypes: [] },
] as const;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const principal = await requirePermission(request, PERMISSIONS.CONFIG_VIEW);
    // The repository scopes results to the authenticated tenant: never trust a tenant header.
    const versions = await listConfigurationVersions({principal, resourceType:null, limit:200});
    const packs = [...agentPacks.knowledge_packs.map((pack) => ({
      id:pack.pack_id, version:pack.version, status:pack.approval_state, rules:pack.rules
    })), {id:crossCutting.pack_id,version:crossCutting.version,status:crossCutting.approval_state,rules:crossCutting.rules}];
    return Response.json({success:true,data:{
      categories:CATEGORIES,
      managedRecords:versions.filter(record=>CATEGORIES.some(category=>(category.resourceTypes as readonly string[]).includes(record.resourceType))).map(record=>({
        id:record.id,category:record.resourceType,name:record.displayName,key:record.configKey,
        version:record.versionLabel,status:record.lifecycleStatus,effectiveFrom:record.effectiveFrom,
        effectiveTo:record.effectiveTo,updatedAt:record.updatedAt
      })),
      packs,sources:agentPacks.sources,
      draftRuleCount:packs.reduce((total,pack)=>total+pack.rules.length,0),
      clinicalUseAuthorized:false,
      liveKnowledgeResolverConnected:false,
      note:"Draft static rules are not indexed, approved or active. Managed records show live tenant-controlled configuration metadata."
    }},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return routeErrorResponse(error);}
}
