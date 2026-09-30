import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";

export interface CreateSafetyCaseInput {
  intakeRecordId: string;
  caseKey: string;
  reportType?: string;
  studyType?: string;
  countryCode?: string;
  initialReceiptDate: string;
  latestReceiptDate: string;
  seriousnessStatus?: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  expeditedReportingRequired?: boolean;
  reason: string;
}

export interface SafetyCaseSummary {
  caseId: string;
  caseKey: string;
  intakeRecordId: string;
  caseStatus: string;
  currentVersion: number;
  initialReceiptDate: string;
  latestReceiptDate: string;
  createdAt: string;
  reused: boolean;
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 10) {
    throw new Error("A case-creation reason of at least 10 characters is required.");
  }
  return reason;
}

export async function createSafetyCaseShellInTransaction(input: {
  client: PoolClient;
  principal: RequestPrincipal;
  request: CreateSafetyCaseInput;
}): Promise<SafetyCaseSummary> {
  const intakeRecordId = input.request.intakeRecordId.trim();
  const caseKey = input.request.caseKey.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  if (!caseKey) throw new Error("caseKey is required.");
  const reason = requireReason(input.request.reason);
  const scope = requireSafetyWorkspaceScope(input.principal);

  const intake = await input.client.query<{
    id: string;
    status: string;
    existing_case_id: string | null;
    existing_case_key: string | null;
    existing_case_status: string | null;
    existing_current_version: number | null;
    existing_initial_receipt_date: string | null;
    existing_latest_receipt_date: string | null;
    existing_created_at: string | null;
  }>(
    `SELECT intake.id, intake.status,
            safety_case.id AS existing_case_id,
            safety_case.case_key AS existing_case_key,
            safety_case.case_status AS existing_case_status,
            safety_case.current_version AS existing_current_version,
            safety_case.initial_receipt_date::text AS existing_initial_receipt_date,
            safety_case.latest_receipt_date::text AS existing_latest_receipt_date,
            safety_case.created_at::text AS existing_created_at
       FROM safety_intake_records intake
       LEFT JOIN safety_cases safety_case
         ON safety_case.tenant_id = intake.tenant_id
        AND safety_case.workspace_id = intake.workspace_id
        AND safety_case.environment = intake.environment
        AND safety_case.intake_record_id = intake.id
      WHERE intake.tenant_id = $1
        AND intake.workspace_id = $2
        AND intake.environment = $3
        AND intake.id = $4
      FOR UPDATE OF intake`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      intakeRecordId,
    ],
  );

  const row = intake.rows[0];
  if (!row) {
    throw new Error(
      "Safety intake record was not found in the selected client workspace/environment.",
    );
  }

  if (row.existing_case_id) {
    return {
      caseId: row.existing_case_id,
      caseKey: row.existing_case_key!,
      intakeRecordId,
      caseStatus: row.existing_case_status!,
      currentVersion: Number(row.existing_current_version || 0),
      initialReceiptDate: row.existing_initial_receipt_date!,
      latestReceiptDate: row.existing_latest_receipt_date!,
      createdAt: new Date(row.existing_created_at!).toISOString(),
      reused: true,
    };
  }

  if (row.status !== "READY_FOR_CASE") {
    throw new Error("Safety intake must be READY_FOR_CASE before a case can be created.");
  }

  const caseId = randomUUID();
  const created = await input.client.query<{ created_at: string }>(
    `INSERT INTO safety_cases (
       id, tenant_id, workspace_id, environment, case_key, intake_record_id, case_status,
       report_type, study_type, country_code, initial_receipt_date,
       latest_receipt_date, seriousness_status, expedited_reporting_required,
       current_version, created_by, updated_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,'NEW',$7,$8,$9,$10,$11,$12,$13,0,$14,$14
     )
     RETURNING created_at::text`,
    [
      caseId,
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      caseKey,
      intakeRecordId,
      input.request.reportType ?? null,
      input.request.studyType ?? null,
      input.request.countryCode ?? null,
      input.request.initialReceiptDate,
      input.request.latestReceiptDate,
      input.request.seriousnessStatus ?? "UNRESOLVED",
      input.request.expeditedReportingRequired ?? null,
      input.principal.userId,
    ],
  );

  await input.client.query(
    `UPDATE safety_intake_records
        SET status = 'CASE_CREATED',
            updated_by = $5,
            updated_at = now()
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND environment = $3
        AND id = $4`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      intakeRecordId,
      input.principal.userId,
    ],
  );

  await input.client.query(
    `INSERT INTO safety_review_tasks (
       tenant_id, task_key, entity_type, entity_id, task_type,
       status, created_by
     ) VALUES (
       $1,$2,'CASE',$3,'CASE_PROCESSING','OPEN',$4
     )
     ON CONFLICT (tenant_id, task_key)
     DO NOTHING`,
    [
      input.principal.tenantId,
      `case-processing:${caseId}`,
      caseId,
      input.principal.userId,
    ],
  );

  await input.client.query(
    `INSERT INTO audit_events (
       tenant_id, workspace_id, environment, module_key, actor_id,
       event_type, event_category, outcome, details
     ) VALUES (
       $1,$2,$3,'CASE_PROCESSING',$4,
       'SAFETY_CASE_CREATED','NEXUS_CASE_PROCESSING','success',$5::jsonb
     )`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      input.principal.userId,
      JSON.stringify({
        caseId,
        caseKey,
        intakeRecordId,
        reason,
      }),
    ],
  );

  return {
    caseId,
    caseKey,
    intakeRecordId,
    caseStatus: "NEW",
    currentVersion: 0,
    initialReceiptDate: input.request.initialReceiptDate,
    latestReceiptDate: input.request.latestReceiptDate,
    createdAt: new Date(created.rows[0].created_at).toISOString(),
    reused: false,
  };
}

export async function createSafetyCaseShell(input: {
  principal: RequestPrincipal;
  request: CreateSafetyCaseInput;
}): Promise<SafetyCaseSummary> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const result = await createSafetyCaseShellInTransaction({
      client,
      principal: input.principal,
      request: input.request,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
