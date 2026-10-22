import {type NextRequest} from "next/server";
import {getPostgresPool} from "@/lib/database/postgres";
import {routeErrorResponse} from "@/lib/api/route-error";
import {NEXUS_MODULES} from "@/lib/nexus/modules";
import {PERMISSIONS} from "@/lib/rbac/permissions";
import {requireWorkspaceModulePermission} from "@/lib/rbac/workspace-guard";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 try{
 const p=await requireWorkspaceModulePermission(request,NEXUS_MODULES.LITERATURE,PERMISSIONS.SEARCH_HISTORY_VIEW);
 const stage=request.nextUrl.searchParams.get("stage");
 if(stage && !["HITS","SCREENING","MEDICAL_REVIEW"].includes(stage))return Response.json({success:false,error:"Invalid stage"},{status:400});
 const result=await getPostgresPool().query(`SELECT a.assignment_id::text,a.record_id::text,a.stage,a.status,a.assigned_at,p.package_key,
 CASE WHEN l.expires_at>clock_timestamp() THEN CASE WHEN l.locked_by_user_id=$1 THEN 'LOCKED_BY_ME' ELSE 'LOCKED_BY_OTHER' END ELSE 'AVAILABLE' END AS lock_status,
 CASE WHEN l.expires_at>clock_timestamp() THEN l.locked_by_user_id ELSE NULL END AS locked_by_user_id,
 CASE WHEN l.expires_at>clock_timestamp() THEN l.expires_at ELSE NULL END AS expires_at
 FROM nexus_record_assignments a JOIN literature_packages p ON p.id=a.record_id AND p.tenant_id=a.tenant_id AND p.workspace_id=a.workspace_id AND p.environment=a.environment
 LEFT JOIN nexus_record_locks l ON l.record_id=a.record_id AND l.tenant_id=a.tenant_id AND l.workspace_id=a.workspace_id AND l.environment=a.environment
 WHERE a.tenant_id=$2::uuid AND a.workspace_id=$3::uuid AND a.environment=$4 AND a.assigned_to_user_id=$1
 AND a.status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED') AND ($5::text IS NULL OR a.stage=$5)
 ORDER BY a.assigned_at DESC LIMIT 500`,[p.userId,p.tenantId,p.workspaceId,p.environment,stage]);
 return Response.json({success:true,data:{records:result.rows,count:result.rowCount}},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return routeErrorResponse(e);}
}