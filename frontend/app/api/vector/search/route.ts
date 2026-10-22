import { type NextRequest, NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/rbac/request-principal";
import { routeErrorResponse } from "@/lib/api/route-error";
import { vectorStore } from "@/lib/vector/vector-store";
import { workspaceVectorNamespace } from "@/lib/vector/workspace-namespace";
import type { VectorSearchRequest } from "@/lib/vector/vector-types";
export async function POST(request: NextRequest) {
  try {
    const principal = await resolveRequestPrincipal(request);
    const body = await request.json() as VectorSearchRequest;
    if (!body || typeof body.query !== "string" || body.query.length > 10000 ||
        (body.topK !== undefined && (!Number.isInteger(body.topK) || body.topK < 1 || body.topK > 100)))
      return NextResponse.json({success:false,error:"Invalid scoped vector search."},{status:400});
    const result = await vectorStore.search({...body,tenantId:workspaceVectorNamespace(principal)});
    return NextResponse.json({success:true,data:{...result,tenantId:principal.tenantId,workspaceId:principal.workspaceId,
      results:result.results.map(r=>({...r,document:{...r.document,tenantId:principal.tenantId,
        metadata:{...r.document.metadata,tenantId:principal.tenantId,workspaceId:principal.workspaceId,environment:principal.environment}}}))}},
      {headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
  } catch (error) { return routeErrorResponse(error); }
}
