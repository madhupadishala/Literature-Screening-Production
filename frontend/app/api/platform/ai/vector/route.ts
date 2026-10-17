import { type NextRequest, NextResponse } from "next/server";
import { resolveRequestPrincipal, AuthorizationError } from "@/lib/rbac/request-principal";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { routeErrorResponse } from "@/lib/api/route-error";
import { workspaceVectorNamespace } from "@/lib/vector/workspace-namespace";
import { vectorStore } from "@/lib/platform/vector/vector-store";
import type { VectorRecord, VectorSearchRequest } from "@/lib/platform/vector/vector-types";
export async function GET(request: NextRequest) {
  try {
    const principal=await resolveRequestPrincipal(request);
    return NextResponse.json({provider:"memory",durable:false,tenantId:principal.tenantId,workspaceId:principal.workspaceId,environment:principal.environment},
      {headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
  } catch(error){return routeErrorResponse(error);}
}
export async function POST(request: NextRequest) {
  try {
    const principal=await resolveRequestPrincipal(request);
    const body=await request.json() as VectorRecord|VectorSearchRequest;
    if(!body || typeof body!=="object")return NextResponse.json({error:"Invalid vector request."},{status:400});
    const namespace=workspaceVectorNamespace(principal);
    const vector="queryVector" in body ? body.queryVector : body.vector;
    if(!Array.isArray(vector)||vector.length<2||vector.length>4096||vector.some(v=>typeof v!=="number"||!Number.isFinite(v)))
      return NextResponse.json({error:"Invalid vector dimensions or values."},{status:400});
    if("queryVector" in body){
      if(body.topK!==undefined&&(!Number.isInteger(body.topK)||body.topK<1||body.topK>100))return NextResponse.json({error:"Invalid search limit."},{status:400});
      return NextResponse.json({results:vectorStore.search({...body,tenantId:namespace}).map(r=>({...r,
        metadata:{...r.metadata,tenantId:principal.tenantId,workspaceId:principal.workspaceId,environment:principal.environment}}))},
        {headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
    }
    if(!principal.hasPermission(PERMISSIONS.CONFIG_UPLOAD))throw new AuthorizationError("Vector upload permission required",403);
    if(typeof body.id!=="string"||!body.id.trim()||body.id.length>256||!body.metadata||typeof body.metadata.documentId!=="string"||typeof body.metadata.chunkId!=="string")
      return NextResponse.json({error:"Valid vector identity and source metadata required."},{status:400});
    const record=vectorStore.upsert({...body,id:namespace+":"+body.id,metadata:{...body.metadata,tenantId:namespace}});
    return NextResponse.json({record:{...record,metadata:{...record.metadata,tenantId:principal.tenantId,workspaceId:principal.workspaceId,environment:principal.environment}}},{status:201,
      headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
  } catch(error){return routeErrorResponse(error);}
}
