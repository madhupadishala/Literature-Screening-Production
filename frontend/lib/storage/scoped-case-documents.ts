import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import { requireSafetyWorkspaceScope, assertSafetyIntakeInScope, assertSafetyCaseInScope } from "@/lib/safety/common/safety-workspace-scope";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { r2ObjectStorage } from "@/lib/storage/cloudflare-r2";

const MAX_BYTES = 25 * 1024 * 1024;
const allowed = new Set(["application/pdf", "application/xml", "text/xml", "text/plain", "image/png", "image/jpeg", "application/octet-stream"]);
type Target = { intakeRecordId?: string; caseId?: string };

export async function uploadScopedCaseDocument(input: {
  principal: RequestPrincipal; file: File; target: Target;
}) {
  const { principal, file, target } = input;
  const scope = requireSafetyWorkspaceScope(principal);
  if (Boolean(target.intakeRecordId) === Boolean(target.caseId)) throw new Error("Exactly one authorized ICSR target is required");
  if (target.intakeRecordId) await assertSafetyIntakeInScope(principal, target.intakeRecordId);
  if (target.caseId) await assertSafetyCaseInScope(principal, target.caseId);
  if (!file.size || file.size > MAX_BYTES || !allowed.has(file.type || "application/octet-stream")) {
    throw new Error("Unsupported document type or file exceeds 25 MB");
  }
  if (process.env.CLINIXAI_STORAGE_PROVIDER !== "cloudflare-r2") {
    throw new Error("Durable private R2 storage is required for regulated ICSR uploads");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("File size changed during upload");
  const id = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectKey = ["nexus", principal.tenantId, scope.workspaceId, scope.environment, "icsr", target.caseId || target.intakeRecordId, id].join("/");
  const bucket = process.env.CLINIXAI_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("Private document bucket is not configured");
  const pool = getPostgresPool();
  // PENDING rows are not readable. Object existence and registry activation are separate stages.
  await pool.query(
    `INSERT INTO nexus_document_objects (id,tenant_id,workspace_id,environment,intake_record_id,case_id,object_key,bucket,content_type,original_filename,bytes,sha256,document_type,state,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ICSR_SOURCE','PENDING',$13)`,
    [id,principal.tenantId,scope.workspaceId,scope.environment,target.intakeRecordId||null,target.caseId||null,objectKey,bucket,file.type || "application/octet-stream",file.name.slice(0,255),bytes.length,sha256,principal.userId],
  );
  try {
    await r2ObjectStorage.put(objectKey, bytes, file.type || "application/octet-stream");
    await pool.query(
      `UPDATE nexus_document_objects SET state='ACTIVE',activated_at=now()
       WHERE id=$1 AND tenant_id=$2 AND workspace_id=$3 AND environment=$4 AND state='PENDING'`,
      [id,principal.tenantId,scope.workspaceId,scope.environment],
    );
  } catch (error) {
    // Preserve an audit-visible failed record; never present a failed object as uploaded.
    await pool.query("UPDATE nexus_document_objects SET state='FAILED' WHERE id=$1 AND state='PENDING'",[id]).catch(()=>undefined);
    throw error;
  }
  return { id, filename:file.name, bytes:bytes.length, sha256, status:"ACTIVE" };
}

export async function listScopedCaseDocuments(input: {principal:RequestPrincipal; target:Target}) {
  const {principal,target} = input;
  const scope = requireSafetyWorkspaceScope(principal);
  if (Boolean(target.intakeRecordId) === Boolean(target.caseId)) throw new Error("Exactly one authorized ICSR target is required");
  if (target.intakeRecordId) await assertSafetyIntakeInScope(principal,target.intakeRecordId);
  if (target.caseId) await assertSafetyCaseInScope(principal,target.caseId);
  const result = await getPostgresPool().query(
    `SELECT id,original_filename AS filename,content_type,bytes,sha256,state,created_at,archived_at
       FROM nexus_document_objects
      WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3
        AND intake_record_id IS NOT DISTINCT FROM $4::uuid
        AND case_id IS NOT DISTINCT FROM $5::uuid
        AND state IN ('ACTIVE','ARCHIVED')
      ORDER BY created_at DESC`,
    [principal.tenantId,scope.workspaceId,scope.environment,target.intakeRecordId||null,target.caseId||null],
  );
  return result.rows;
}
