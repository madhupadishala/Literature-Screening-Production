import "server-only";

import { randomUUID } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";

import { AGGREGATE_REPORT_TYPES, type CreateAggregateReportRequest, type CreateAggregateVersionRequest } from "./aggregate-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value:string,label:string,min=1){const v=value.trim();if(v.length<min)throw new Error(`${label} must contain at least ${min} characters.`);return v;}
function date(value:string,label:string){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error(`${label} must be a valid date.`);return d.toISOString().slice(0,10);}

async function buildSourceSnapshot(principal:RequestPrincipal, periodStart:string, periodEnd:string) {
  const scope=requireSafetyWorkspaceScope(principal);
  const rows=await getPostgresPool().query<{
    id:string;case_key:string;final_version_id:string;case_sha256:string;latest_receipt_date:string;
  }>(
    `SELECT c.id,c.case_key,c.final_version_id,v.case_sha256,c.latest_receipt_date
       FROM safety_cases c
       JOIN safety_case_versions v
         ON v.id=c.final_version_id AND v.tenant_id=c.tenant_id
      WHERE c.tenant_id=$1 AND c.workspace_id=$2 AND c.environment=$3
        AND c.case_status IN ('FINALIZED','SUBMITTED','CLOSED')
        AND c.latest_receipt_date BETWEEN $4::date AND $5::date
      ORDER BY c.case_key`,
    [principal.tenantId,scope.workspaceId,scope.environment,periodStart,periodEnd],
  );
  return {
    schemaVersion:"1.0.0",
    scope:{tenantId:principal.tenantId,workspaceId:scope.workspaceId,environment:scope.environment},
    periodStart,periodEnd,
    finalizedCases:rows.rows.map(r=>({
      caseId:r.id,caseKey:r.case_key,caseVersionId:r.final_version_id,
      caseSha256:r.case_sha256,latestReceiptDate:r.latest_receipt_date,
    })),
  };
}

export async function createAggregateReport(input:{principal:RequestPrincipal;request:CreateAggregateReportRequest}) {
  if(!(AGGREGATE_REPORT_TYPES as readonly string[]).includes(input.request.reportType))throw new Error("Unsupported aggregate reportType.");
  const periodStart=date(input.request.periodStart,"periodStart");
  const periodEnd=date(input.request.periodEnd,"periodEnd");
  if(periodEnd<periodStart)throw new Error("periodEnd cannot precede periodStart.");
  const reason=text(input.request.reason,"reason",10);
  const scope=requireSafetyWorkspaceScope(input.principal);
  const sourceSnapshot=await buildSourceSnapshot(input.principal,periodStart,periodEnd);
  const sourceSha256=canonicalSha256(sourceSnapshot);
  const result=await getPostgresPool().query<Record<string,unknown>>(
    `INSERT INTO nexus_aggregate_reports (
       id,tenant_id,workspace_id,environment,report_key,report_type,product_key,
       period_start,period_end,status,source_snapshot,source_sha256,created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'GENERATED',$10::jsonb,$11,$12)
     RETURNING *`,
    [randomUUID(),input.principal.tenantId,scope.workspaceId,scope.environment,
     text(input.request.reportKey,"reportKey"),input.request.reportType,input.request.productKey?.trim()||null,
     periodStart,periodEnd,JSON.stringify(sourceSnapshot),sourceSha256,input.principal.userId],
  );
  await getPostgresPool().query(
    `INSERT INTO audit_events (tenant_id,workspace_id,environment,module_key,actor_id,event_type,event_category,outcome,details)
     VALUES ($1,$2,$3,'AGGREGATE_REPORTING',$4,'AGGREGATE_REPORT_CREATED','NEXUS_AGGREGATE','success',$5::jsonb)`,
    [input.principal.tenantId,scope.workspaceId,scope.environment,input.principal.userId,JSON.stringify({
      aggregateReportId:result.rows[0].id,sourceSha256,reason,
    })],
  );
  return result.rows[0];
}

export async function listAggregateReports(input:{principal:RequestPrincipal;limit?:number}) {
  const scope=requireSafetyWorkspaceScope(input.principal);
  const limit=Math.max(1,Math.min(input.limit??100,500));
  const result=await getPostgresPool().query<Record<string,unknown>>(
    `SELECT id,report_key,report_type,product_key,period_start,period_end,status,source_sha256,created_at,updated_at
       FROM nexus_aggregate_reports
      WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3
      ORDER BY updated_at DESC LIMIT $4`,
    [input.principal.tenantId,scope.workspaceId,scope.environment,limit],
  );
  return result.rows;
}

export async function getAggregateReport(input:{principal:RequestPrincipal;reportId:string}) {
  const scope=requireSafetyWorkspaceScope(input.principal);
  const result=await getPostgresPool().query<Record<string,unknown>>(
    `SELECT report.*,
      COALESCE((SELECT jsonb_agg(v ORDER BY v.version) FROM nexus_aggregate_report_versions v WHERE v.aggregate_report_id=report.id),'[]'::jsonb) AS versions
      FROM nexus_aggregate_reports report
      WHERE report.tenant_id=$1 AND report.workspace_id=$2 AND report.environment=$3 AND report.id=$4 LIMIT 1`,
    [input.principal.tenantId,scope.workspaceId,scope.environment,input.reportId],
  );
  if(!result.rows[0])throw new Error("Aggregate report was not found in the selected client workspace/environment.");
  return result.rows[0];
}

export async function createAggregateVersion(input:{principal:RequestPrincipal;reportId:string;request:CreateAggregateVersionRequest}) {
  if(!isRecord(input.request.content))throw new Error("Aggregate report content must be a JSON object.");
  if(!["DRAFT","REVIEWED","APPROVED","FINALIZED"].includes(input.request.status))throw new Error("Unsupported aggregate version status.");
  const scope=requireSafetyWorkspaceScope(input.principal);
  const client=await getPostgresPool().connect();
  try{
    await client.query("BEGIN");
    const parent=await client.query<{id:string;status:string}>(
      `SELECT id,status FROM nexus_aggregate_reports
        WHERE tenant_id=$1 AND workspace_id=$2 AND environment=$3 AND id=$4 FOR UPDATE`,
      [input.principal.tenantId,scope.workspaceId,scope.environment,input.reportId],
    );
    if(!parent.rows[0])throw new Error("Aggregate report was not found in the selected client workspace/environment.");
    if(parent.rows[0].status==="FINALIZED")throw new Error("Finalized aggregate report cannot be edited in place.");
    const next=await client.query<{next_version:number}>(
      `SELECT COALESCE(MAX(version),0)+1 AS next_version FROM nexus_aggregate_report_versions WHERE aggregate_report_id=$1`,
      [input.reportId],
    );
    const contentSha256=canonicalSha256(input.request.content);
    const inserted=await client.query<Record<string,unknown>>(
      `INSERT INTO nexus_aggregate_report_versions (
        tenant_id,workspace_id,environment,aggregate_report_id,version,content,content_sha256,change_reason,status,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *`,
      [input.principal.tenantId,scope.workspaceId,scope.environment,input.reportId,
       Number(next.rows[0].next_version),JSON.stringify(input.request.content),contentSha256,
       text(input.request.changeReason,"changeReason",10),input.request.status,input.principal.userId],
    );
    const parentStatus=input.request.status==="FINALIZED"?"FINALIZED":input.request.status==="APPROVED"?"APPROVED":"UNDER_REVIEW";
    await client.query(`UPDATE nexus_aggregate_reports SET status=$2,updated_at=now() WHERE id=$1`,[input.reportId,parentStatus]);
    await client.query(
      `INSERT INTO audit_events (
         tenant_id,workspace_id,environment,module_key,actor_id,event_type,event_category,outcome,details
       ) VALUES ($1,$2,$3,'AGGREGATE_REPORTING',$4,'AGGREGATE_VERSION_RECORDED','NEXUS_AGGREGATE','success',$5::jsonb)`,
      [input.principal.tenantId,scope.workspaceId,scope.environment,input.principal.userId,JSON.stringify({
        aggregateReportId:input.reportId,
        version:Number(next.rows[0].next_version),
        versionStatus:input.request.status,
        contentSha256,
        changeReason:input.request.changeReason,
      })],
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
