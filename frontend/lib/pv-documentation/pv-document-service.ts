import "server-only";

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";
import { PV_DOCUMENT_TYPES, type CreatePvDocumentRequest, type CreatePvDocumentVersionRequest } from "./pv-document-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value:unknown,label:string,min=1){if(typeof value!=="string")throw new Error(`${label} is required.`);const v=value.trim();if(v.length<min)throw new Error(`${label} must contain at least ${min} characters.`);return v;}
function optionalDate(value:unknown,label:string){if(value===undefined||value===null||value==="")return null;if(typeof value!=="string")throw new Error(`${label} must be a valid date string.`);const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error(`${label} must be a valid date.`);return d.toISOString().slice(0,10);}

const PV_DOCUMENT_TRANSITIONS: Record<string, readonly string[]> = {
 DRAFT: ["DRAFT","REVIEWED"],
 IN_REVIEW: ["REVIEWED","APPROVED"],
 APPROVED: ["EFFECTIVE","RETIRED"],
 EFFECTIVE: ["RETIRED"],
 RETIRED: [],
};

export async function createPvDocument(input:{principal:RequestPrincipal;request:CreatePvDocumentRequest}){
 if(!(PV_DOCUMENT_TYPES as readonly string[]).includes(input.request.documentType))throw new Error("Unsupported PV documentType.");
 const scope=requireSafetyWorkspaceScope(input.principal);
 const documentKey=text(input.request.documentKey,"documentKey");
 const title=text(input.request.title,"title");
 const reason=text(input.request.reason,"reason",10);
 const client=await getPostgresPool().connect();
 try{
  await client.query("BEGIN");
  const result=await client.query<Record<string,unknown>>(
   `INSERT INTO nexus_pv_documents (
     id,tenant_id,workspace_id,environment,document_key,document_type,title,lifecycle_status,created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8) RETURNING *`,
   [randomUUID(),input.principal.tenantId,scope.workspaceId,scope.environment,
    documentKey,input.request.documentType,title,input.principal.userId],
  );
  await client.query(
   `INSERT INTO audit_events (tenant_id,workspace_id,environment,module_key,actor_id,event_type,event_category,outcome,details)
    VALUES ($1,$2,$3,'PV_DOCUMENTATION',$4,'PV_DOCUMENT_CREATED','NEXUS_PV_DOCUMENTATION','success',$5::jsonb)`,
   [input.principal.tenantId,scope.workspaceId,scope.environment,input.principal.userId,
    JSON.stringify({documentId:result.rows[0].id,reason})],
  );
  await client.query("COMMIT");
  return result.rows[0];
 }catch(error){
  await client.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{
  client.release();
 }
}

export async function listPvDocuments(input:{principal:RequestPrincipal;limit?:number}){
 const scope=requireSafetyWorkspaceScope(input.principal);const limit=Math.max(1,Math.min(input.limit??100,500));
 const result=await getPostgresPool().query<Record<string,unknown>>(
  `SELECT id,document_key,document_type,title,lifecycle_status,current_version,created_at,updated_at
    FROM nexus_pv_documents
    WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3
    ORDER BY updated_at DESC LIMIT $4`,
  [input.principal.tenantId,scope.workspaceId,scope.environment,limit],
 );return result.rows;
}

export async function getPvDocument(input:{principal:RequestPrincipal;documentId:string}){
 const scope=requireSafetyWorkspaceScope(input.principal);
 const result=await getPostgresPool().query<Record<string,unknown>>(
  `SELECT document.*,
    COALESCE((SELECT jsonb_agg(v ORDER BY v.version) FROM nexus_pv_document_versions v WHERE v.document_id=document.id),'[]'::jsonb) AS versions
    FROM nexus_pv_documents document
    WHERE document.tenant_id=$1 AND document.workspace_id=$2 AND document.environment=$3 AND document.id=$4 LIMIT 1`,
  [input.principal.tenantId,scope.workspaceId,scope.environment,input.documentId],
 );
 if(!result.rows[0])throw new Error("PV document was not found in the selected client workspace/environment.");
 return result.rows[0];
}

export async function createPvDocumentVersion(input:{principal:RequestPrincipal;documentId:string;request:CreatePvDocumentVersionRequest}){
 if(!isRecord(input.request.content))throw new Error("PV document content must be a JSON object.");
 if(!["DRAFT","REVIEWED","APPROVED","EFFECTIVE","RETIRED"].includes(input.request.versionStatus))throw new Error("Unsupported PV document version status.");
 if(input.request.linkedSources!==undefined&&(!Array.isArray(input.request.linkedSources)||input.request.linkedSources.some((item)=>!isRecord(item))))throw new Error("linkedSources must be an array of JSON objects.");
 const scope=requireSafetyWorkspaceScope(input.principal);const client=await getPostgresPool().connect();
 try{
  await client.query("BEGIN");
  const parent=await client.query<{id:string;lifecycle_status:string;current_version:number}>(
   `SELECT id,lifecycle_status,current_version FROM nexus_pv_documents
     WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3 AND id=$4 FOR UPDATE`,
   [input.principal.tenantId,scope.workspaceId,scope.environment,input.documentId],
  );
  if(!parent.rows[0])throw new Error("PV document was not found in the selected client workspace/environment.");
  const allowedTransitions=PV_DOCUMENT_TRANSITIONS[parent.rows[0].lifecycle_status]??[];
  if(!allowedTransitions.includes(input.request.versionStatus))throw new Error(`Invalid PV document transition from ${parent.rows[0].lifecycle_status} to ${input.request.versionStatus}.`);
  const effectiveFrom=optionalDate(input.request.effectiveFrom,"effectiveFrom");
  const effectiveUntil=optionalDate(input.request.effectiveUntil,"effectiveUntil");
  if(input.request.versionStatus==="EFFECTIVE"&&!effectiveFrom)throw new Error("effectiveFrom is required for an EFFECTIVE PV document version.");
  if(effectiveFrom&&effectiveUntil&&effectiveUntil<effectiveFrom)throw new Error("effectiveUntil cannot precede effectiveFrom.");
  const changeReason=text(input.request.changeReason,"changeReason",10);
  const contentSha256=canonicalSha256(input.request.content);
  const version=Number(parent.rows[0].current_version)+1;
  const inserted=await client.query<Record<string,unknown>>(
   `INSERT INTO nexus_pv_document_versions (
      tenant_id,workspace_id,environment,document_id,version,version_status,
      content,content_sha256,linked_sources,change_reason,effective_from,effective_until,created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,$13) RETURNING *`,
   [input.principal.tenantId,scope.workspaceId,scope.environment,input.documentId,version,input.request.versionStatus,
    JSON.stringify(input.request.content),contentSha256,JSON.stringify(input.request.linkedSources??[]),
    changeReason,effectiveFrom,effectiveUntil,input.principal.userId],
  );
  const lifecycle=input.request.versionStatus==="EFFECTIVE"?"EFFECTIVE":input.request.versionStatus==="APPROVED"?"APPROVED":input.request.versionStatus==="REVIEWED"?"IN_REVIEW":input.request.versionStatus;
  await client.query(`UPDATE nexus_pv_documents SET current_version=$2,lifecycle_status=$3,updated_at=now() WHERE id=$1`,[input.documentId,version,lifecycle]);
  await client.query(
   `INSERT INTO audit_events (
      tenant_id,workspace_id,environment,module_key,actor_id,event_type,event_category,outcome,details
    ) VALUES ($1,$2,$3,'PV_DOCUMENTATION',$4,'PV_DOCUMENT_VERSION_RECORDED','NEXUS_PV_DOCUMENTATION','success',$5::jsonb)`,
   [input.principal.tenantId,scope.workspaceId,scope.environment,input.principal.userId,JSON.stringify({
     documentId:input.documentId,version,versionStatus:input.request.versionStatus,contentSha256,
     changeReason,effectiveFrom,effectiveUntil,
   })],
  );
  await client.query("COMMIT");return inserted.rows[0];
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
