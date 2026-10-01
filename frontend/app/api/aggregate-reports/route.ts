import { type NextRequest } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error";
import { createAggregateReport,listAggregateReports } from "@/lib/aggregate/aggregate-service";
import type { CreateAggregateReportRequest } from "@/lib/aggregate/aggregate-types";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { requireWorkspaceModulePermission } from "@/lib/rbac/workspace-guard";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
 const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.AGGREGATE_REPORTING,PERMISSIONS.AGGREGATE_VIEW);
 const rawLimit=Number(request.nextUrl.searchParams.get("limit")||"100");\n const limit=Number.isFinite(rawLimit)?rawLimit:100;
 return Response.json({success:true,data:{records:await listAggregateReports({principal,limit})}});
}catch(error){return routeErrorResponse(error);}}
export async function POST(request:NextRequest){try{
 const principal=await requireWorkspaceModulePermission(request,NEXUS_MODULES.AGGREGATE_REPORTING,PERMISSIONS.AGGREGATE_CREATE);
 const body=await request.json().catch(()=>null); if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid aggregate report request body.");
 return Response.json({success:true,data:await createAggregateReport({principal,request:body as CreateAggregateReportRequest})},{status:201});
}catch(error){return routeErrorResponse(error);}}
