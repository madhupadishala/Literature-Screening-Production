import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { getAggregateReport } from "@/lib/aggregate/aggregate-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{reportId:string}>}){try{
 const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.AGGREGATE_REPORTING,PERMISSIONS.AGGREGATE_VIEW);
 const {reportId}=await context.params; return Response.json({success:true,data:await getAggregateReport({principal,reportId})});
}catch(error){return routeErrorResponse(error);}}
