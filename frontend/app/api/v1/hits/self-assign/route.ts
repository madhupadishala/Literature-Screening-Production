import {type NextRequest} from "next/server";
import {getPostgresPool} from "@/lib/database/postgres";
import {routeErrorResponse} from "@/lib/api/route-error";
import {NEXUS_MODULES} from "@/lib/nexus/modules";
import {PERMISSIONS} from "@/lib/rbac/permissions";
import {requireWorkspaceModulePermission} from "@/lib/rbac/workspace-guard";
import {leaseResponse,LeaseError} from "@/lib/literature/assignment/lock-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 try{
  const p=await requireWorkspaceModulePermission(request,NEXUS_MODULES.LITERATURE,PERMISSIONS.HITS_SUBMIT);
  if(!p.workspaceId)throw new LeaseError(403,"WORKSPACE_REQUIRED","Active client workspace required.");
  const body:unknown=await request.json().catch(()=>null);
  const recordId=body&&typeof body==="object"&&!Array.isArray(body)&&"record_id" in body?String(body.record_id):"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId))return Response.json({success:false,error:{code:"INVALID_ID"}},{status:400});
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const found=await c.query(`SELECT id FROM literature_packages WHERE id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 FOR UPDATE`,[recordId,p.tenantId,p.workspaceId,p.environment]);
   if(!found.rowCount)throw new LeaseError(404,"NOT_FOUND","Record not available in selected workspace.");
   const result=await c.query<{assignment_id:string;assigned_to_user_id:string;status:string}>(`
   INSERT INTO nexus_record_assignments(record_id,tenant_id,workspace_id,environment,stage,assigned_to_user_id,assigned_by_user_id,status)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,'HITS',$5,$5,'ACCEPTED')
   ON CONFLICT(record_id,stage) WHERE status IN('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED')
   DO UPDATE SET status=CASE WHEN nexus_record_assignments.assigned_to_user_id=$5 THEN 'ACCEPTED' ELSE nexus_record_assignments.status END,
   updated_at=CASE WHEN nexus_record_assignments.assigned_to_user_id=$5 THEN clock_timestamp() ELSE nexus_record_assignments.updated_at END
   RETURNING assignment_id::text,assigned_to_user_id,status`,[recordId,p.tenantId,p.workspaceId,p.environment,p.userId]);
   if(!result.rows[0]||result.rows[0].assigned_to_user_id!==p.userId)throw new LeaseError(423,"ASSIGNED_TO_OTHER","Another reviewer owns this record.");
   await c.query(`INSERT INTO audit_events(tenant_id,package_id,actor_id,event_type,event_category,outcome,details) VALUES($1::uuid,$2::uuid,$3,'HITS_SELF_ASSIGNED','LITERATURE_REVIEW','success',$4::jsonb)`,[p.tenantId,recordId,p.userId,JSON.stringify({assignmentId:result.rows[0].assignment_id,stage:"HITS"})]);
   await c.query("COMMIT");
   return Response.json({success:true,data:result.rows[0]});
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 }catch(e){return leaseResponse(e)??routeErrorResponse(e);}
}
