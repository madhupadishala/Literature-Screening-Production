import "server-only";

import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { buildE2BR3CasePayload } from "@/lib/safety/common/case-payload-builder";
import {
  createSafetyCaseVersionInTransaction,
  type CaseVersionSummary,
} from "@/lib/safety/common/case-version-service";
import type { SourceLineage } from "@/lib/safety/common/safety-types";
import type { CaseDraftPayload } from "@/lib/safety/case-processing/case-processing-types";
import { evaluateCaseFinalization } from "./case-finalization-policy";

export type ReviewAction = "APPROVE" | "RETURN" | "QUERY" | "COMMENT";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reason(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length < 5) {
    throw new Error(`${label} must contain at least 5 characters.`);
  }
  return normalized;
}

async function loadCase(
  client: PoolClient,
  tenantId: string,
  caseId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT safety_case.*, intake.source_lineage, intake.source_lineage_sha256,
            intake.priority, source.source_type, source.source_system,
            source.source_key, source.source_sha256
       FROM safety_cases safety_case
       JOIN safety_intake_records intake
         ON intake.id = safety_case.intake_record_id
        AND intake.tenant_id = safety_case.tenant_id
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = safety_case.tenant_id
      WHERE safety_case.tenant_id = $1 AND safety_case.id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE OF safety_case" : ""}`,
    [tenantId, caseId],
  );
  if (!result.rows[0]) {
    throw new Error("Safety case was not found in the active tenant.");
  }
  return result.rows[0];
}

async function latestDraft(
  client: PoolClient,
  tenantId: string,
  caseId: string,
  revision: number,
): Promise<CaseDraftPayload> {
  const result = await client.query<{ draft_payload: unknown }>(
    `SELECT draft_payload
       FROM safety_case_draft_versions
      WHERE tenant_id = $1 AND case_id = $2 AND revision = $3
      LIMIT 1`,
    [tenantId, caseId, revision],
  );
  if (!result.rows[0]) throw new Error("Current case draft is unavailable.");
  return object(result.rows[0].draft_payload) as unknown as CaseDraftPayload;
}

async function currentNarrative(
  client: PoolClient,
  tenantId: string,
  caseId: string,
): Promise<{
  narrative_version: number;
  narrative_stage: string;
  narrative_text: string;
} | null> {
  const result = await client.query<{
    narrative_version: number;
    narrative_stage: string;
    narrative_text: string;
  }>(
    `SELECT narrative_version, narrative_stage, narrative_text
       FROM safety_case_narrative_versions
      WHERE tenant_id = $1 AND case_id = $2
        AND narrative_stage IN (
          'PROCESSOR', 'QC', 'MEDICAL_REVIEW', 'FINAL', 'SYSTEM_DRAFT'
        )
      ORDER BY narrative_version DESC
      LIMIT 1`,
    [tenantId, caseId],
  );
  return result.rows[0] ?? null;
}

async function latestAssessments(
  client: PoolClient,
  tenantId: string,
  caseId: string,
): Promise<Array<{
  product_key: string;
  event_key: string;
  assessment_type: string;
  result: string;
  rationale: string;
  evidence: unknown;
}>> {
  const result = await client.query<{
    product_key: string;
    event_key: string;
    assessment_type: string;
    result: string;
    rationale: string;
    evidence: unknown;
  }>(
    `SELECT DISTINCT ON (
       product_key, event_key, assessment_type
     ) product_key, event_key, assessment_type, result, rationale, evidence
       FROM safety_case_assessments
      WHERE tenant_id = $1 AND case_id = $2
      ORDER BY product_key, event_key, assessment_type,
               assessment_version DESC`,
    [tenantId, caseId],
  );
  return result.rows;
}

async function reviewCycle(
  client: PoolClient,
  tenantId: string,
  caseId: string,
  reviewType: "QC" | "MEDICAL_REVIEW",
): Promise<number> {
  const result = await client.query<{ cycle: number }>(
    `SELECT COALESCE(MAX(review_cycle), 0) AS cycle
       FROM safety_case_review_actions
      WHERE tenant_id = $1 AND case_id = $2 AND review_type = $3`,
    [tenantId, caseId, reviewType],
  );
  return Number(result.rows[0].cycle || 0);
}

async function insertAction(input: {
  client: PoolClient;
  principal: RequestPrincipal;
  caseId: string;
  reviewType: "QC" | "MEDICAL_REVIEW" | "FINALIZATION";
  reviewCycle: number;
  actionType: "SUBMIT" | ReviewAction | "FINALIZE";
  draftRevision: number;
  narrativeVersion?: number | null;
  fieldPath?: string | null;
  comments?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await input.client.query(
    `INSERT INTO safety_case_review_actions (
       tenant_id, case_id, review_type, review_cycle, action_type,
       draft_revision, narrative_version, field_path, comments,
       metadata, actor_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      input.principal.tenantId,
      input.caseId,
      input.reviewType,
      input.reviewCycle,
      input.actionType,
      input.draftRevision,
      input.narrativeVersion ?? null,
      input.fieldPath ?? null,
      input.comments ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.principal.userId,
    ],
  );
}

async function openProcessingTask(
  client: PoolClient,
  principal: RequestPrincipal,
  caseId: string,
  taskKey: string,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_review_tasks (
       tenant_id, task_key, entity_type, entity_id, task_type,
       status, created_by
     ) VALUES (
       $1,$2,'CASE',$3,'CASE_PROCESSING','OPEN',$4
     )
     ON CONFLICT (tenant_id, task_key)
     DO NOTHING`,
    [principal.tenantId, taskKey, caseId, principal.userId],
  );
}

export async function submitCaseForQc(input: {
  principal: RequestPrincipal;
  caseId: string;
  comments: string;
}): Promise<{ reviewCycle: number; caseStatus: string }> {
  const comments = reason(input.comments, "QC submission comments");
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const caseRow = await loadCase(
      client,
      input.principal.tenantId,
      input.caseId,
      true,
    );
    if (
      ["FINAL", "FINALIZED", "SUBMITTED", "CLOSED", "VOID"].includes(
        String(caseRow.case_status),
      )
    ) {
      throw new Error("Finalized/closed cases cannot be submitted for QC.");
    }
    if (Number(caseRow.current_draft_revision) < 1) {
      throw new Error("A case draft is required before QC submission.");
    }

    const openQueries = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM safety_case_queries
        WHERE tenant_id = $1 AND case_id = $2 AND status = 'OPEN'`,
      [input.principal.tenantId, input.caseId],
    );
    if (Number(openQueries.rows[0]?.count ?? 0) > 0) {
      throw new Error("Resolve open review queries before resubmitting to QC.");
    }

    const narrative = await currentNarrative(
      client,
      input.principal.tenantId,
      input.caseId,
    );
    if (!narrative || narrative.narrative_text.trim().length < 10) {
      throw new Error("A processor/system narrative is required before QC submission.");
    }

    const currentCycle = await reviewCycle(
      client,
      input.principal.tenantId,
      input.caseId,
      "QC",
    );
    const nextCycle = currentCycle + 1;

    await insertAction({
      client,
      principal: input.principal,
      caseId: input.caseId,
      reviewType: "QC",
      reviewCycle: nextCycle,
      actionType: "SUBMIT",
      draftRevision: Number(caseRow.current_draft_revision),
      narrativeVersion: Number(narrative.narrative_version),
      comments,
    });

    await client.query(
      `UPDATE safety_cases
          SET case_status = 'READY_FOR_QC',
              ready_for_qc_at = now(),
              qc_approved_at = NULL,
              medical_review_approved_at = NULL,
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, input.caseId, input.principal.userId],
    );

    await client.query(
      `UPDATE safety_review_tasks
          SET status = 'COMPLETED',
              completed_at = now(),
              outcome = $3::jsonb,
              updated_at = now()
        WHERE tenant_id = $1
          AND entity_type = 'CASE'
          AND entity_id = $2
          AND task_type = 'CASE_PROCESSING'
          AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
      [
        input.principal.tenantId,
        input.caseId,
        JSON.stringify({ outcome: "READY_FOR_QC", reviewCycle: nextCycle }),
      ],
    );

    await client.query(
      `INSERT INTO safety_review_tasks (
         tenant_id, task_key, entity_type, entity_id, task_type,
         status, created_by
       ) VALUES (
         $1,$2,'CASE',$3,'QC','OPEN',$4
       )`,
      [
        input.principal.tenantId,
        `case-qc:${input.caseId}:cycle:${nextCycle}`,
        input.caseId,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_SUBMITTED_FOR_QC','NEXUS_CASE_REVIEW',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          reviewCycle: nextCycle,
          draftRevision: Number(caseRow.current_draft_revision),
          comments,
        }),
      ],
    );

    await client.query("COMMIT");
    return { reviewCycle: nextCycle, caseStatus: "READY_FOR_QC" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordQcAction(input: {
  principal: RequestPrincipal;
  caseId: string;
  action: ReviewAction;
  comments: string;
  fieldPath?: string;
  queryText?: string;
}): Promise<{ reviewCycle: number; caseStatus: string }> {
  const comments = reason(input.comments, "QC comments");
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const caseRow = await loadCase(
      client,
      input.principal.tenantId,
      input.caseId,
      true,
    );
    if (
      !["READY_FOR_QC", "QC_REVIEW"].includes(String(caseRow.case_status)) &&
      input.action !== "COMMENT"
    ) {
      throw new Error("Case is not currently available for QC decision.");
    }

    const cycle = await reviewCycle(
      client,
      input.principal.tenantId,
      input.caseId,
      "QC",
    );
    if (cycle < 1) throw new Error("No active QC review cycle exists.");

    const narrative = await currentNarrative(
      client,
      input.principal.tenantId,
      input.caseId,
    );

    if (input.action === "QUERY" && (!input.queryText || input.queryText.trim().length < 5)) {
      throw new Error("QC queryText must contain at least 5 characters.");
    }

    await insertAction({
      client,
      principal: input.principal,
      caseId: input.caseId,
      reviewType: "QC",
      reviewCycle: cycle,
      actionType: input.action,
      draftRevision: Number(caseRow.current_draft_revision),
      narrativeVersion: narrative?.narrative_version ?? null,
      fieldPath: input.fieldPath ?? null,
      comments,
    });

    let nextStatus = String(caseRow.case_status);

    if (input.action === "APPROVE") {
      nextStatus = "QC_APPROVED";
      await client.query(
        `UPDATE safety_cases
            SET case_status = 'QC_APPROVED',
                qc_approved_at = now(),
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, input.caseId, input.principal.userId],
      );

      await client.query(
        `UPDATE safety_review_tasks
            SET status = 'COMPLETED', completed_at = now(),
                outcome = $4::jsonb, updated_at = now()
          WHERE tenant_id = $1 AND entity_type = 'CASE' AND entity_id = $2
            AND task_type = 'QC'
            AND task_key = $3
            AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
        [
          input.principal.tenantId,
          input.caseId,
          `case-qc:${input.caseId}:cycle:${cycle}`,
          JSON.stringify({ action: "APPROVE", comments }),
        ],
      );

      await client.query(
        `INSERT INTO safety_review_tasks (
           tenant_id, task_key, entity_type, entity_id, task_type,
           status, created_by
         ) VALUES (
           $1,$2,'CASE',$3,'MEDICAL_REVIEW','OPEN',$4
         )
         ON CONFLICT (tenant_id, task_key) DO NOTHING`,
        [
          input.principal.tenantId,
          `case-medical-review:${input.caseId}:cycle:${cycle}`,
          input.caseId,
          input.principal.userId,
        ],
      );
    }

    if (input.action === "RETURN" || input.action === "QUERY") {
      nextStatus = "QC_RETURNED";

      if (input.action === "QUERY") {
        await client.query(
          `INSERT INTO safety_case_queries (
             tenant_id, case_id, review_type, review_cycle,
             field_path, query_text, raised_by
           ) VALUES ($1,$2,'QC',$3,$4,$5,$6)`,
          [
            input.principal.tenantId,
            input.caseId,
            cycle,
            input.fieldPath ?? null,
            input.queryText!.trim(),
            input.principal.userId,
          ],
        );
      }

      await client.query(
        `UPDATE safety_cases
            SET case_status = 'QC_RETURNED',
                qc_approved_at = NULL,
                medical_review_approved_at = NULL,
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, input.caseId, input.principal.userId],
      );

      await client.query(
        `UPDATE safety_review_tasks
            SET status = 'COMPLETED', completed_at = now(),
                outcome = $4::jsonb, updated_at = now()
          WHERE tenant_id = $1 AND entity_type = 'CASE' AND entity_id = $2
            AND task_type = 'QC'
            AND task_key = $3
            AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
        [
          input.principal.tenantId,
          input.caseId,
          `case-qc:${input.caseId}:cycle:${cycle}`,
          JSON.stringify({ action: input.action, comments }),
        ],
      );

      await openProcessingTask(
        client,
        input.principal,
        input.caseId,
        `case-processing-qc-return:${input.caseId}:cycle:${cycle}`,
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_QC_ACTION','NEXUS_CASE_REVIEW','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          reviewCycle: cycle,
          action: input.action,
          draftRevision: Number(caseRow.current_draft_revision),
          comments,
          fieldPath: input.fieldPath ?? null,
        }),
      ],
    );

    await client.query("COMMIT");
    return { reviewCycle: cycle, caseStatus: nextStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordMedicalReviewAction(input: {
  principal: RequestPrincipal;
  caseId: string;
  action: ReviewAction;
  comments: string;
  fieldPath?: string;
  queryText?: string;
}): Promise<{ reviewCycle: number; caseStatus: string }> {
  const comments = reason(input.comments, "Medical Review comments");
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const caseRow = await loadCase(
      client,
      input.principal.tenantId,
      input.caseId,
      true,
    );
    if (
      !["QC_APPROVED", "MEDICAL_REVIEW"].includes(String(caseRow.case_status)) &&
      input.action !== "COMMENT"
    ) {
      throw new Error("Case is not currently available for Medical Review decision.");
    }

    const cycle = await reviewCycle(
      client,
      input.principal.tenantId,
      input.caseId,
      "QC",
    );
    if (cycle < 1) throw new Error("No approved QC review cycle exists.");

    const latestQcApproval = await client.query<{ draft_revision: number }>(
      `SELECT draft_revision
         FROM safety_case_review_actions
        WHERE tenant_id = $1 AND case_id = $2
          AND review_type = 'QC'
          AND review_cycle = $3
          AND action_type = 'APPROVE'
        ORDER BY acted_at DESC LIMIT 1`,
      [input.principal.tenantId, input.caseId, cycle],
    );
    if (
      !latestQcApproval.rows[0] ||
      Number(latestQcApproval.rows[0].draft_revision) !==
        Number(caseRow.current_draft_revision)
    ) {
      throw new Error(
        "Current draft revision does not have a matching QC approval.",
      );
    }

    const narrative = await currentNarrative(
      client,
      input.principal.tenantId,
      input.caseId,
    );

    if (input.action === "QUERY" && (!input.queryText || input.queryText.trim().length < 5)) {
      throw new Error("Medical Review queryText must contain at least 5 characters.");
    }

    await insertAction({
      client,
      principal: input.principal,
      caseId: input.caseId,
      reviewType: "MEDICAL_REVIEW",
      reviewCycle: cycle,
      actionType: input.action,
      draftRevision: Number(caseRow.current_draft_revision),
      narrativeVersion: narrative?.narrative_version ?? null,
      fieldPath: input.fieldPath ?? null,
      comments,
    });

    let nextStatus = "MEDICAL_REVIEW";

    if (input.action === "APPROVE") {
      await client.query(
        `UPDATE safety_cases
            SET case_status = 'MEDICAL_REVIEW',
                medical_review_approved_at = now(),
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, input.caseId, input.principal.userId],
      );

      await client.query(
        `UPDATE safety_review_tasks
            SET status = 'COMPLETED', completed_at = now(),
                outcome = $4::jsonb, updated_at = now()
          WHERE tenant_id = $1 AND entity_type = 'CASE' AND entity_id = $2
            AND task_type = 'MEDICAL_REVIEW'
            AND task_key = $3
            AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
        [
          input.principal.tenantId,
          input.caseId,
          `case-medical-review:${input.caseId}:cycle:${cycle}`,
          JSON.stringify({ action: "APPROVE", comments }),
        ],
      );

      await client.query(
        `INSERT INTO safety_review_tasks (
           tenant_id, task_key, entity_type, entity_id, task_type,
           status, created_by
         ) VALUES (
           $1,$2,'CASE',$3,'FINALIZATION','OPEN',$4
         )
         ON CONFLICT (tenant_id, task_key) DO NOTHING`,
        [
          input.principal.tenantId,
          `case-finalization:${input.caseId}:cycle:${cycle}`,
          input.caseId,
          input.principal.userId,
        ],
      );
    }

    if (input.action === "RETURN" || input.action === "QUERY") {
      nextStatus = "PROCESSING";

      if (input.action === "QUERY") {
        await client.query(
          `INSERT INTO safety_case_queries (
             tenant_id, case_id, review_type, review_cycle,
             field_path, query_text, raised_by
           ) VALUES ($1,$2,'MEDICAL_REVIEW',$3,$4,$5,$6)`,
          [
            input.principal.tenantId,
            input.caseId,
            cycle,
            input.fieldPath ?? null,
            input.queryText!.trim(),
            input.principal.userId,
          ],
        );
      }

      await client.query(
        `UPDATE safety_cases
            SET case_status = 'PROCESSING',
                medical_review_approved_at = NULL,
                qc_approved_at = NULL,
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, input.caseId, input.principal.userId],
      );

      await client.query(
        `UPDATE safety_review_tasks
            SET status = 'COMPLETED', completed_at = now(),
                outcome = $4::jsonb, updated_at = now()
          WHERE tenant_id = $1 AND entity_type = 'CASE' AND entity_id = $2
            AND task_type = 'MEDICAL_REVIEW'
            AND task_key = $3
            AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
        [
          input.principal.tenantId,
          input.caseId,
          `case-medical-review:${input.caseId}:cycle:${cycle}`,
          JSON.stringify({ action: input.action, comments }),
        ],
      );

      await openProcessingTask(
        client,
        input.principal,
        input.caseId,
        `case-processing-medical-return:${input.caseId}:cycle:${cycle}`,
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_MEDICAL_REVIEW_ACTION','NEXUS_CASE_REVIEW',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          reviewCycle: cycle,
          action: input.action,
          draftRevision: Number(caseRow.current_draft_revision),
          comments,
          fieldPath: input.fieldPath ?? null,
        }),
      ],
    );

    await client.query("COMMIT");
    return { reviewCycle: cycle, caseStatus: nextStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveCaseQuery(input: {
  principal: RequestPrincipal;
  caseId: string;
  queryId: string;
  responseText: string;
}): Promise<void> {
  const responseText = reason(input.responseText, "Query response");
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_queries
        WHERE tenant_id = $1 AND case_id = $2 AND id = $3
        FOR UPDATE`,
      [input.principal.tenantId, input.caseId, input.queryId],
    );
    const query = result.rows[0];
    if (!query) throw new Error("Case review query was not found.");
    if (String(query.status) !== "OPEN") {
      throw new Error("Case review query is not open.");
    }

    await client.query(
      `UPDATE safety_case_queries
          SET status = 'RESOLVED',
              response_text = $4,
              resolved_by = $5,
              resolved_at = now()
        WHERE tenant_id = $1 AND case_id = $2 AND id = $3`,
      [
        input.principal.tenantId,
        input.caseId,
        input.queryId,
        responseText,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_REVIEW_QUERY_RESOLVED','NEXUS_CASE_REVIEW',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          queryId: input.queryId,
          responseText,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function finalizationContext(
  client: PoolClient,
  tenantId: string,
  caseId: string,
): Promise<{
  caseRow: Record<string, unknown>;
  draft: CaseDraftPayload;
  assessments: Awaited<ReturnType<typeof latestAssessments>>;
  narrative: Awaited<ReturnType<typeof currentNarrative>>;
  openQueryCount: number;
  qcApproved: boolean;
  medicalReviewApproved: boolean;
  reviewCycle: number;
}> {
  const caseRow = await loadCase(client, tenantId, caseId, true);
  const revision = Number(caseRow.current_draft_revision);
  const draft = await latestDraft(client, tenantId, caseId, revision);
  const assessments = await latestAssessments(client, tenantId, caseId);
  const narrative = await currentNarrative(client, tenantId, caseId);
  const cycle = await reviewCycle(client, tenantId, caseId, "QC");

  const [queries, qc, medical] = await Promise.all([
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM safety_case_queries
        WHERE tenant_id = $1 AND case_id = $2 AND status = 'OPEN'`,
      [tenantId, caseId],
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM safety_case_review_actions
        WHERE tenant_id = $1 AND case_id = $2
          AND review_type = 'QC'
          AND review_cycle = $3
          AND action_type = 'APPROVE'
          AND draft_revision = $4`,
      [tenantId, caseId, cycle, revision],
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM safety_case_review_actions
        WHERE tenant_id = $1 AND case_id = $2
          AND review_type = 'MEDICAL_REVIEW'
          AND review_cycle = $3
          AND action_type = 'APPROVE'
          AND draft_revision = $4`,
      [tenantId, caseId, cycle, revision],
    ),
  ]);

  return {
    caseRow,
    draft,
    assessments,
    narrative,
    openQueryCount: Number(queries.rows[0]?.count ?? 0),
    qcApproved: Number(qc.rows[0]?.count ?? 0) > 0,
    medicalReviewApproved: Number(medical.rows[0]?.count ?? 0) > 0,
    reviewCycle: cycle,
  };
}

export async function runCaseFinalizationCheck(input: {
  principal: RequestPrincipal;
  caseId: string;
}): Promise<{
  ready: boolean;
  checks: Array<{ key: string; passed: boolean; message: string }>;
  checkVersion: number;
}> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const context = await finalizationContext(
      client,
      input.principal.tenantId,
      input.caseId,
    );

    const evaluation = evaluateCaseFinalization({
      draft: context.draft,
      assessments: context.assessments.map((item) => ({
        productKey: item.product_key,
        eventKey: item.event_key,
        assessmentType: item.assessment_type,
        result: item.result,
      })),
      narrative: context.narrative
        ? {
            narrativeVersion: Number(context.narrative.narrative_version),
            narrativeStage: String(context.narrative.narrative_stage),
            narrativeText: String(context.narrative.narrative_text),
          }
        : null,
      review: {
        qcApproved: context.qcApproved,
        medicalReviewApproved: context.medicalReviewApproved,
        openQueryCount: context.openQueryCount,
      },
    });

    const version = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(check_version), 0) + 1 AS next_version
         FROM safety_case_finalization_checks
        WHERE tenant_id = $1 AND case_id = $2`,
      [input.principal.tenantId, input.caseId],
    );
    const checkVersion = Number(version.rows[0].next_version);

    await client.query(
      `INSERT INTO safety_case_finalization_checks (
         tenant_id, case_id, draft_revision, check_version,
         ready, checks, checked_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        input.principal.tenantId,
        input.caseId,
        Number(context.caseRow.current_draft_revision),
        checkVersion,
        evaluation.ready,
        JSON.stringify(evaluation.checks),
        input.principal.userId,
      ],
    );

    await client.query("COMMIT");
    return { ...evaluation, checkVersion };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function lineageFromCase(caseRow: Record<string, unknown>): SourceLineage {
  const stored = object(caseRow.source_lineage);
  if (
    typeof stored.sourceSystem === "string" &&
    typeof stored.sourceRecordType === "string" &&
    typeof stored.sourceRecordId === "string"
  ) {
    return stored as unknown as SourceLineage;
  }

  return {
    sourceSystem: String(caseRow.source_system || "NEXUS_INTAKE"),
    sourceRecordType: String(caseRow.source_type || "SAFETY_SOURCE"),
    sourceRecordId: String(caseRow.source_key || caseRow.intake_record_id),
    sourceSha256:
      typeof caseRow.source_sha256 === "string"
        ? caseRow.source_sha256
        : undefined,
  };
}

export async function finalizeSafetyCase(input: {
  principal: RequestPrincipal;
  caseId: string;
  reason: string;
}): Promise<{
  caseVersion: CaseVersionSummary;
  finalizationCheck: {
    ready: boolean;
    checks: Array<{ key: string; passed: boolean; message: string }>;
  };
}> {
  const finalReason = reason(input.reason, "Finalization reason");
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const context = await finalizationContext(
      client,
      input.principal.tenantId,
      input.caseId,
    );

    if (
      ["FINAL", "FINALIZED", "SUBMITTED", "CLOSED", "VOID"].includes(
        String(context.caseRow.case_status),
      )
    ) {
      throw new Error("This case is already finalized or closed.");
    }

    const evaluation = evaluateCaseFinalization({
      draft: context.draft,
      assessments: context.assessments.map((item) => ({
        productKey: item.product_key,
        eventKey: item.event_key,
        assessmentType: item.assessment_type,
        result: item.result,
      })),
      narrative: context.narrative
        ? {
            narrativeVersion: Number(context.narrative.narrative_version),
            narrativeStage: String(context.narrative.narrative_stage),
            narrativeText: String(context.narrative.narrative_text),
          }
        : null,
      review: {
        qcApproved: context.qcApproved,
        medicalReviewApproved: context.medicalReviewApproved,
        openQueryCount: context.openQueryCount,
      },
    });

    const checkVersionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(check_version), 0) + 1 AS next_version
         FROM safety_case_finalization_checks
        WHERE tenant_id = $1 AND case_id = $2`,
      [input.principal.tenantId, input.caseId],
    );

    await client.query(
      `INSERT INTO safety_case_finalization_checks (
         tenant_id, case_id, draft_revision, check_version,
         ready, checks, checked_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        input.principal.tenantId,
        input.caseId,
        Number(context.caseRow.current_draft_revision),
        Number(checkVersionResult.rows[0].next_version),
        evaluation.ready,
        JSON.stringify(evaluation.checks),
        input.principal.userId,
      ],
    );

    if (!evaluation.ready) {
      const failed = evaluation.checks
        .filter((item) => !item.passed)
        .map((item) => item.key)
        .join(", ");
      throw new Error(`Case cannot be finalized. Failed checks: ${failed}.`);
    }
    if (!context.narrative) {
      throw new Error("Final narrative is unavailable.");
    }

    const nextVersion = Number(context.caseRow.current_version) + 1;
    const payload = buildE2BR3CasePayload({
      tenantId: input.principal.tenantId,
      caseId: input.caseId,
      caseKey: String(context.caseRow.case_key),
      intakeRecordId: String(context.caseRow.intake_record_id),
      version: nextVersion,
      lineage: lineageFromCase(context.caseRow),
      identification: {
        caseKey: context.draft.identification.caseKey,
        reportType: context.draft.identification.reportType ?? null,
        studyType: context.draft.identification.studyType ?? null,
        countryCode: context.draft.identification.countryCode ?? null,
        initialReceiptDate: context.draft.identification.initialReceiptDate,
        latestReceiptDate: context.draft.identification.latestReceiptDate,
        seriousnessStatus: context.draft.identification.seriousnessStatus,
        expeditedReportingRequired:
          context.draft.identification.expeditedReportingRequired ?? null,
      },
      reporters: context.draft.reporters,
      patient: context.draft.patient,
      events: context.draft.events,
      tests: context.draft.tests,
      products: context.draft.products,
      narrative: {
        caseNarrative: context.narrative.narrative_text,
        narrativeVersion: context.narrative.narrative_version,
        assessmentSummary: context.assessments.map((item) => ({
          productKey: item.product_key,
          eventKey: item.event_key,
          assessmentType: item.assessment_type,
          result: item.result,
          rationale: item.rationale,
          evidence: object(item.evidence),
        })),
      },
    });

    const versionType =
      Number(context.caseRow.current_version) === 0 ? "INITIAL" : "FOLLOW_UP";

    const caseVersion = await createSafetyCaseVersionInTransaction({
      client,
      principal: input.principal,
      caseId: input.caseId,
      versionType,
      payload,
      reason: finalReason,
    });

    const nextNarrative = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(narrative_version), 0) + 1 AS next_version
         FROM safety_case_narrative_versions
        WHERE tenant_id = $1 AND case_id = $2`,
      [input.principal.tenantId, input.caseId],
    );

    await client.query(
      `INSERT INTO safety_case_narrative_versions (
         tenant_id, case_id, narrative_version, narrative_stage,
         narrative_text, source_revision, change_reason,
         narrative_sha256, created_by
       )
       SELECT $1,$2,$3,'FINAL',$4,$5,$6,
              encode(digest(convert_to($4, 'UTF8'), 'sha256'), 'hex'),$7`,
      [
        input.principal.tenantId,
        input.caseId,
        Number(nextNarrative.rows[0].next_version),
        context.narrative.narrative_text,
        Number(context.caseRow.current_draft_revision),
        finalReason,
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_cases
          SET case_status = 'FINAL',
              final_version_id = $3,
              locked_at = now(),
              locked_by = $4,
              finalized_at = now(),
              finalized_by = $4,
              updated_by = $4,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        input.caseId,
        caseVersion.caseVersionId,
        input.principal.userId,
      ],
    );

    await insertAction({
      client,
      principal: input.principal,
      caseId: input.caseId,
      reviewType: "FINALIZATION",
      reviewCycle: Math.max(context.reviewCycle, 1),
      actionType: "FINALIZE",
      draftRevision: Number(context.caseRow.current_draft_revision),
      narrativeVersion: Number(context.narrative.narrative_version),
      comments: finalReason,
      metadata: {
        caseVersionId: caseVersion.caseVersionId,
        caseVersion: caseVersion.version,
        caseSha256: caseVersion.caseSha256,
      },
    });

    await client.query(
      `UPDATE safety_review_tasks
          SET status = 'COMPLETED', completed_at = now(),
              outcome = $3::jsonb, updated_at = now()
        WHERE tenant_id = $1 AND entity_type = 'CASE' AND entity_id = $2
          AND task_type = 'FINALIZATION'
          AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
      [
        input.principal.tenantId,
        input.caseId,
        JSON.stringify({
          action: "FINALIZE",
          caseVersionId: caseVersion.caseVersionId,
          version: caseVersion.version,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'SAFETY_CASE_FINALIZED','NEXUS_CASE_FINALIZATION',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          draftRevision: Number(context.caseRow.current_draft_revision),
          caseVersionId: caseVersion.caseVersionId,
          version: caseVersion.version,
          caseSha256: caseVersion.caseSha256,
          finalReason,
        }),
      ],
    );

    await client.query("COMMIT");
    return {
      caseVersion,
      finalizationCheck: evaluation,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
