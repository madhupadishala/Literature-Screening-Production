import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { createAggregateVersion } from "@/lib/aggregate/aggregate-service";
import type { CreateAggregateVersionRequest } from "@/lib/aggregate/aggregate-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request:NextRequest,context:{params:Promise<{reportId:string}>}){try{
 const body=await request.json().catch(()=>null); if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid aggregate version body.");
 const req=body as CreateAggregateVersionRequest;
 const permission=req.status==="APPROVED"||req.status==="FINALIZED"?PERMISSIONS.AGGREGATE_APPROVE:PERMISSIONS.AGGREGATE_REVIEW;
 const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.AGGREGATE_REPORTING,permission);
 const {reportId}=await context.params;
 return Response.json({success:true,data:await createAggregateVersion({principal,reportId,request:req})},{status:201});
}catch(error){return routeErrorResponse(error);}}
