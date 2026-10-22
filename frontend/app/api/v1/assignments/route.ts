import {type NextRequest} from "next/server";
import {getPostgresPool} from "@/lib/database/postgres";
import {routeErrorResponse} from "@/lib/api/route-error";
import {NEXUS_MODULES} from "@/lib/nexus/modules";
import {PERMISSIONS} from "@/lib/rbac/permissions";
import {requireWorkspaceModulePermission} from "@/lib/rbac/workspace-guard";
import {leaseResponse,LeaseError} from "@/lib/literature/assignment/lock-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 try{
  const principal=await requireWorkspaceModulePermission(req,NEXUS_MODULES.LITERATURE,PERMISSIONS.SEARCH_HISTORY_VIEW);
  if(principal.workspaceRole!=="WORKSPACE_ADMIN"&&!principal.moduleRoles.some(x=>x==="MODULE_MANAGER"||x==="MODULE_ADMIN"))return Response.json({success:false,error:"Assignment requires manager privileges"},{status:403});
  const raw:unknown=await req.json().catch(()=>null);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return Response.json({success:false,error:"Invalid JSON body"},{status:400});
  const data=raw as Record<string,unknown>;
  const recordId=typeof data.record_id==="string"?data.record_id:"";
  const userId=typeof data.assigned_to_user_id==="string"?data.assigned_to_user_id.trim():"";
  const stage=typeof data.stage==="string"?data.stage:"";
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(recordId)||!userId||!["HITS","SCREENING","MEDICAL_REVIEW"].includes(stage))return Response.json({success:false,error:"record_id, assigned_to_user_id and valid stage required"},{status:400});
  const c=await getPostgresPool().connect();
  try{
   await c.query("BEGIN");
   const source=await c.query<{id:string}>(`SELECT id FROM literature_packages WHERE id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 FOR UPDATE`,[recordId,principal.tenantId,principal.workspaceId,principal.environment]);
   if(!source.rowCount)throw new LeaseError(404,"NOT_FOUND","Record not in active workspace.");
   const member=await c.query(`SELECT 1 FROM nexus_workspace_memberships wm JOIN nexus_workspace_module_roles role ON role.user_id=wm.user_id AND role.tenant_id=wm.tenant_id AND role.workspace_id=wm.workspace_id AND role.status='active' AND role.environment=$4 AND role.module_key=$5 WHERE wm.tenant_id=$1::uuid AND wm.workspace_id=$2::uuid AND wm.user_id=$3 AND wm.status='active' AND role.role_key IN ('MODULE_OPERATOR','MODULE_REVIEWER','MODULE_QC','MODULE_MEDICAL_REVIEWER','MODULE_MANAGER','MODULE_ADMIN') LIMIT 1`,[principal.tenantId,principal.workspaceId,userId,principal.environment,NEXUS_MODULES.LITERATURE]);
   if(!member.rowCount)throw new LeaseError(403,"ASSIGNEE_DENIED","Target user is not an active Literature workspace reviewer.");
   const lock=await c.query(`SELECT 1 FROM nexus_record_locks WHERE record_id=$1::uuid AND expires_at>clock_timestamp() FOR UPDATE`,[recordId]);
   if(lock.rowCount)throw new LeaseError(423,"ACTIVE_LOCK","Cannot reassign an actively edited record.");
   const existing=await c.query<{assignment_id:string}>(`SELECT assignment_id FROM nexus_record_assignments WHERE record_id=$1::uuid AND stage=$2 AND status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED') FOR UPDATE`,[recordId,stage]);
   const saved=existing.rows[0]?await c.query(`UPDATE nexus_record_assignments SET assigned_to_user_id=$2,assigned_by_user_id=$3,status='PENDING_ACCEPTANCE',updated_at=clock_timestamp() WHERE assignment_id=$1 RETURNING assignment_id`,[existing.rows[0].assignment_id,userId,principal.userId]):await c.query(`INSERT INTO nexus_record_assignments(record_id,tenant_id,workspace_id,environment,stage,assigned_to_user_id,assigned_by_user_id,status) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,'PENDING_ACCEPTANCE') RETURNING assignment_id`,[recordId,principal.tenantId,principal.workspaceId,principal.environment,stage,userId,principal.userId]);
   await c.query(`INSERT INTO audit_events(tenant_id,package_id,actor_id,event_type,event_category,outcome,details) VALUES($1,$2,$3,'WORK_ASSIGNMENT_CHANGED','LITERATURE_REVIEW','success',$4::jsonb)`,[principal.tenantId,recordId,principal.userId,JSON.stringify({stage,assignedTo:userId,assignmentId:saved.rows[0].assignment_id})]);
   await c.query("COMMIT");return Response.json({success:true,data:{assignment_id:saved.rows[0].assignment_id}});
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 }catch(e){return leaseResponse(e)??routeErrorResponse(e);}
}
