import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export type Stage = "HITS" | "SCREENING" | "MEDICAL_REVIEW";
export type LeaseProof = { lock_token: string; fencing_token: string };
export class LeaseError extends Error {
  constructor(public status: 403 | 404 | 409 | 423, public code: string, message: string) { super(message); this.name="LeaseError"; }
}
const validUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function assertScope(p:RequestPrincipal): asserts p is RequestPrincipal & {workspaceId:string} {
  if(!p.workspaceId) throw new LeaseError(403,"WORKSPACE_REQUIRED","Select a client workspace.");
}
async function ownedPackage(c:PoolClient, id:string,p:RequestPrincipal) {
  assertScope(p);
  if(!validUuid(id)) throw new LeaseError(404,"RECORD_NOT_FOUND","Record not found.");
  const result=await c.query<{id:string}>(`SELECT id FROM literature_packages WHERE id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 FOR SHARE`,[id,p.tenantId,p.workspaceId,p.environment]);
  if(!result.rows[0])throw new LeaseError(404,"RECORD_NOT_FOUND","Record not found in active context.");
}
function checkProof(proof:LeaseProof) {
  if(!validUuid(proof.lock_token)|| !/^[1-9][0-9]*$/.test(proof.fencing_token))throw new LeaseError(409,"INVALID_PROOF","Valid lock and fencing tokens required.");
}
export async function acquireRecordLock(id:string,p:RequestPrincipal,stage:Stage) {
  assertScope(p); const c=await getPostgresPool().connect();
  try {
    await c.query("BEGIN");
    await ownedPackage(c,id,p);
    const existing=await c.query<{assigned_to_user_id:string}>(`SELECT assigned_to_user_id FROM nexus_record_assignments WHERE record_id=$1::uuid AND stage=$2 AND status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED') FOR UPDATE`,[id,stage]);
    if(existing.rows[0] && existing.rows[0].assigned_to_user_id!==p.userId)throw new LeaseError(423,"ASSIGNED_TO_OTHER","Assigned to another reviewer.");
    if(!existing.rows[0]){
      const a=await c.query(`INSERT INTO nexus_record_assignments(record_id,tenant_id,workspace_id,environment,stage,assigned_to_user_id,assigned_by_user_id,status)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$6,'ACCEPTED') ON CONFLICT (record_id,stage) WHERE status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED') DO NOTHING RETURNING assignment_id`,[id,p.tenantId,p.workspaceId,p.environment,stage,p.userId]);
      if(!a.rowCount)throw new LeaseError(423,"ASSIGNMENT_CONFLICT","Record already claimed.");
    }
    const result=await c.query<{lock_token:string;fencing_token:string;expires_at:Date}>(`
    INSERT INTO nexus_record_locks(record_id,tenant_id,workspace_id,environment,stage,locked_by_user_id,lock_token,fencing_token,expires_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::uuid,nextval('nexus_record_lock_fencing_seq'),clock_timestamp()+interval '180 seconds')
    ON CONFLICT(record_id) DO UPDATE SET stage=EXCLUDED.stage,locked_by_user_id=EXCLUDED.locked_by_user_id,lock_token=EXCLUDED.lock_token,
    fencing_token=nextval('nexus_record_lock_fencing_seq'),acquired_at=clock_timestamp(),expires_at=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
    WHERE nexus_record_locks.expires_at<=clock_timestamp() AND nexus_record_locks.tenant_id=EXCLUDED.tenant_id AND nexus_record_locks.workspace_id=EXCLUDED.workspace_id AND nexus_record_locks.environment=EXCLUDED.environment
    RETURNING lock_token::text,fencing_token::text,expires_at`,[id,p.tenantId,p.workspaceId,p.environment,stage,p.userId,randomUUID()]);
    if(!result.rowCount)throw new LeaseError(423,"LOCKED","Locked by another reviewer.");
    await c.query(`UPDATE nexus_record_assignments SET status='IN_PROGRESS',updated_at=now() WHERE record_id=$1::uuid AND stage=$2 AND assigned_to_user_id=$3 AND status IN ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS','RETURNED')`,[id,stage,p.userId]);
    await c.query("COMMIT");return {...result.rows[0],expires_at:result.rows[0].expires_at.toISOString()};
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
export async function renewRecordLock(id:string,p:RequestPrincipal,stage:Stage,proof:LeaseProof){
  assertScope(p);checkProof(proof);
  const result=await getPostgresPool().query<{expires_at:Date}>(`
  UPDATE nexus_record_locks l SET expires_at=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp()
  WHERE record_id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 AND stage=$5 AND locked_by_user_id=$6
  AND lock_token=$7::uuid AND fencing_token=$8::bigint AND expires_at>clock_timestamp()
  AND EXISTS (SELECT 1 FROM literature_packages p WHERE p.id=l.record_id AND p.tenant_id=l.tenant_id AND p.workspace_id=l.workspace_id AND p.environment=l.environment)
  RETURNING expires_at`,[id,p.tenantId,p.workspaceId,p.environment,stage,p.userId,proof.lock_token,proof.fencing_token]);
  if(!result.rowCount)throw new LeaseError(423,"LEASE_EXPIRED","Lock missing, expired or superseded.");
  return {expires_at:result.rows[0].expires_at.toISOString(),fencing_token:proof.fencing_token};
}
export async function releaseRecordLock(id:string,p:RequestPrincipal,stage:Stage,proof:LeaseProof){
  assertScope(p);checkProof(proof);
  const r=await getPostgresPool().query(`DELETE FROM nexus_record_locks WHERE record_id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 AND stage=$5 AND locked_by_user_id=$6 AND lock_token=$7::uuid AND fencing_token=$8::bigint RETURNING record_id`,[id,p.tenantId,p.workspaceId,p.environment,stage,p.userId,proof.lock_token,proof.fencing_token]);
  if(!r.rowCount)throw new LeaseError(409,"LEASE_MISMATCH","Lock no longer held by this user.");
}
export async function getRecordLockStatus(id:string,p:RequestPrincipal){
  assertScope(p);
  const c=await getPostgresPool().connect();
  try{
    await ownedPackage(c,id,p);
    const r=await c.query<{locked_by_user_id:string;expires_at:Date}>(`SELECT locked_by_user_id,expires_at FROM nexus_record_locks WHERE record_id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid AND environment=$4 AND expires_at>clock_timestamp()`,[id,p.tenantId,p.workspaceId,p.environment]);
    return {state:!r.rowCount?"AVAILABLE":r.rows[0].locked_by_user_id===p.userId?"LOCKED_BY_ME":"LOCKED_BY_OTHER",locked_by_user_id:r.rows[0]?.locked_by_user_id??null,expires_at:r.rows[0]?.expires_at?.toISOString()??null};
  }finally{c.release();}
}
export async function requireMutationLease(c:PoolClient,id:string,p:RequestPrincipal,stage:Stage,proof:LeaseProof){
  assertScope(p);checkProof(proof);
  const r=await c.query(`SELECT l.record_id FROM nexus_record_locks l JOIN literature_packages pkg ON pkg.id=l.record_id AND pkg.tenant_id=l.tenant_id AND pkg.workspace_id=l.workspace_id AND pkg.environment=l.environment
  JOIN nexus_record_assignments a ON a.record_id=l.record_id AND a.tenant_id=l.tenant_id AND a.workspace_id=l.workspace_id AND a.environment=l.environment AND a.stage=l.stage
  WHERE l.record_id=$1::uuid AND l.tenant_id=$2::uuid AND l.workspace_id=$3::uuid AND l.environment=$4 AND l.stage=$5 AND l.locked_by_user_id=$6 AND l.lock_token=$7::uuid AND l.fencing_token=$8::bigint AND l.expires_at>clock_timestamp() AND a.assigned_to_user_id=$6 AND a.status='IN_PROGRESS' FOR UPDATE OF l`,[id,p.tenantId,p.workspaceId,p.environment,stage,p.userId,proof.lock_token,proof.fencing_token]);
  if(!r.rowCount)throw new LeaseError(423,"LOCK_REQUIRED","A valid current edit lease is required.");
}
export function leaseResponse(error:unknown):Response|null{
  return error instanceof LeaseError?Response.json({success:false,error:{code:error.code,message:error.message}},{status:error.status}):null;
}
