import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export type IntakeReviewType = "QC" | "MEDICAL_REVIEW";
export type IntakeReviewAction = "APPROVE" | "RETURN";

export interface IntakeLifecycleReviewWorkspace {
  intake: {
    id: string;
    intakeKey: string;
    status: string;
    priority: string;
    seriousnessStatus: string;
    validityStatus: string;
    triageStatus: string;
    triageOutcome: string | null;
    caseRelationship: string | null;
  };
  assessment: {
    id: string;
    assessmentVersion: number;
    humanValidityDecision: string;
    seriousnessStatus: string;
    priority: string;
    followUpRequired: boolean;
    triageOutcome: string;
    rationale: string;
    assessedAt: string;
  } | null;
  reviewType: IntakeReviewType;
  task: {
    id: string;
    status: string;
    assignedTo: string | null;
    dueAt: string | null;
    outcome: Record<string, unknown>;
    updatedAt: string;
  } | null;
  history: Array<{
    eventType: string;
    outcome: string;
    details: Record<string, unknown>;
    occurredAt: string;
  }>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function eventType(reviewType: IntakeReviewType): string {
  return reviewType === "QC" ? "INTAKE_QC_REVIEW_ACTION" : "INTAKE_MEDICAL_REVIEW_ACTION";
}

export async function getIntakeLifecycleReviewWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reviewType: IntakeReviewType;
}): Promise<IntakeLifecycleReviewWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const [intakeResult, assessmentResult, taskResult, historyResult] = await Promise.all([
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT id, intake_key, status, priority, seriousness_status,
              validity_status, triage_status, triage_outcome, case_relationship
         FROM safety_intake_records
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT id, assessment_version, human_validity_decision,
              seriousness_status, priority, follow_up_required,
              triage_outcome, rationale, assessed_at
         FROM safety_triage_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT id, status, assigned_to, due_at, outcome, updated_at
         FROM safety_review_tasks
        WHERE tenant_id = $1
          AND entity_type = 'INTAKE_RECORD'
          AND entity_id = $2
          AND task_type = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId, input.reviewType],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT event_type, outcome, details, occurred_at
         FROM audit_events
        WHERE tenant_id = $1
          AND event_type IN ('INTAKE_QC_REVIEW_ACTION','INTAKE_MEDICAL_REVIEW_ACTION')
          AND details ->> 'intakeRecordId' = $2
        ORDER BY occurred_at DESC
        LIMIT 50`,
      [input.principal.tenantId, intakeRecordId],
    ),
  ]);

  const intake = intakeResult.rows[0];
  if (!intake) throw new Error("Safety Intake was not found in the active tenant.");
  const assessment = assessmentResult.rows[0] ?? null;
  const task = taskResult.rows[0] ?? null;

  return {
    intake: {
      id: String(intake.id),
      intakeKey: String(intake.intake_key),
      status: String(intake.status),
      priority: String(intake.priority),
      seriousnessStatus: String(intake.seriousness_status),
      validityStatus: String(intake.validity_status),
      triageStatus: String(intake.triage_status),
      triageOutcome: intake.triage_outcome ? String(intake.triage_outcome) : null,
      caseRelationship: intake.case_relationship ? String(intake.case_relationship) : null,
    },
    assessment: assessment
      ? {
          id: String(assessment.id),
          assessmentVersion: Number(assessment.assessment_version),
          humanValidityDecision: String(assessment.human_validity_decision),
          seriousnessStatus: String(assessment.seriousness_status),
          priority: String(assessment.priority),
          followUpRequired: assessment.follow_up_required === true,
          triageOutcome: String(assessment.triage_outcome),
          rationale: String(assessment.rationale),
          assessedAt: new Date(String(assessment.assessed_at)).toISOString(),
        }
      : null,
    reviewType: input.reviewType,
    task: task
      ? {
          id: String(task.id),
          status: String(task.status),
          assignedTo: task.assigned_to ? String(task.assigned_to) : null,
          dueAt: task.due_at ? new Date(String(task.due_at)).toISOString() : null,
          outcome: object(task.outcome),
          updatedAt: new Date(String(task.updated_at)).toISOString(),
        }
      : null,
    history: historyResult.rows.map((row) => ({
      eventType: String(row.event_type),
      outcome: String(row.outcome),
      details: object(row.details),
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    })),
  };
}

export async function finalizeIntakeLifecycleReview(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reviewType: IntakeReviewType;
  action: IntakeReviewAction;
  rationale: string;
}): Promise<IntakeLifecycleReviewWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  const rationale = input.rationale.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  if (!(["QC", "MEDICAL_REVIEW"] as const).includes(input.reviewType)) {
    throw new Error("reviewType must be QC or MEDICAL_REVIEW.");
  }
  if (!(["APPROVE", "RETURN"] as const).includes(input.action)) {
    throw new Error("action must be APPROVE or RETURN.");
  }
  if (rationale.length < 10) {
    throw new Error("Review rationale must contain at least 10 characters.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const intakeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM safety_intake_records
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1 FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId],
    );
    const intake = intakeResult.rows[0];
    if (!intake) throw new Error("Safety Intake was not found in the active tenant.");
    if (String(intake.duplicate_review_status) !== "COMPLETE") {
      throw new Error("Duplicate/follow-up review must be COMPLETE before lifecycle review.");
    }
    if (String(intake.case_relationship) === "DUPLICATE") {
      throw new Error("A confirmed duplicate does not enter QC or Medical Review lifecycle.");
    }
    if (String(intake.triage_status) !== "COMPLETE") {
      throw new Error("Formal ICSR triage must be COMPLETE before lifecycle review.");
    }

    const assessmentResult = await client.query<{ id: string; assessment_version: number }>(
      `SELECT id, assessment_version
         FROM safety_triage_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    );
    const assessment = assessmentResult.rows[0];
    if (!assessment) throw new Error("No triage assessment is available for review.");

    const taskResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM safety_review_tasks
        WHERE tenant_id = $1
          AND entity_type = 'INTAKE_RECORD'
          AND entity_id = $2
          AND task_type = $3
          AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')
        ORDER BY created_at DESC
        LIMIT 1 FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId, input.reviewType],
    );
    const task = taskResult.rows[0];
    if (!task) throw new Error(`No active ${input.reviewType} task is available.`);

    const taskOutcome = object(task.outcome);
    const taskAssessmentVersion = Number(taskOutcome.assessmentVersion ?? 0);
    if (taskAssessmentVersion !== Number(assessment.assessment_version)) {
      throw new Error("This review task is bound to an older triage assessment revision.");
    }

    await client.query(
      `UPDATE safety_review_tasks
          SET status = 'COMPLETED',
              completed_at = now(),
              outcome = $4::jsonb,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2 AND entity_id = $3`,
      [
        input.principal.tenantId,
        String(task.id),
        intakeRecordId,
        JSON.stringify({
          assessmentId: assessment.id,
          assessmentVersion: assessment.assessment_version,
          action: input.action,
          rationale,
          reviewedBy: input.principal.userId,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'NEXUS_INTAKE_LIFECYCLE',$4,$5::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        eventType(input.reviewType),
        input.action === "APPROVE" ? "success" : "returned",
        JSON.stringify({
          intakeRecordId,
          taskId: task.id,
          reviewType: input.reviewType,
          action: input.action,
          assessmentId: assessment.id,
          assessmentVersion: assessment.assessment_version,
          rationale,
        }),
      ],
    );

    if (input.action === "RETURN") {
      await client.query(
        `UPDATE safety_intake_records
            SET status = 'IN_TRIAGE',
                triage_status = 'IN_PROGRESS',
                triage_outcome = NULL,
                validity_status = 'UNASSESSED',
                seriousness_status = 'UNASSESSED',
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, intakeRecordId, input.principal.userId],
      );

      await client.query(
        `UPDATE safety_review_tasks
            SET status = 'CANCELLED', updated_at = now()
          WHERE tenant_id = $1
            AND entity_type = 'INTAKE_RECORD'
            AND entity_id = $2
            AND task_type IN ('QC','MEDICAL_REVIEW')
            AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')`,
        [input.principal.tenantId, intakeRecordId],
      );

      await client.query(
        `INSERT INTO safety_review_tasks (
           tenant_id, task_key, entity_type, entity_id, task_type,
           status, outcome, created_by
         ) VALUES ($1,$2,'INTAKE_RECORD',$3,'TRIAGE','OPEN',$4::jsonb,$5)
         ON CONFLICT (tenant_id, task_key) DO NOTHING`,
        [
          input.principal.tenantId,
          `triage-rework:${intakeRecordId}:after-${input.reviewType.toLowerCase()}-v${assessment.assessment_version}`,
          intakeRecordId,
          JSON.stringify({
            returnedFrom: input.reviewType,
            assessmentVersion: assessment.assessment_version,
            rationale,
          }),
          input.principal.userId,
        ],
      );
    } else if (input.reviewType === "QC") {
      await client.query(
        `INSERT INTO safety_review_tasks (
           tenant_id, task_key, entity_type, entity_id, task_type,
           status, outcome, created_by
         ) VALUES ($1,$2,'INTAKE_RECORD',$3,'MEDICAL_REVIEW','OPEN',$4::jsonb,$5)
         ON CONFLICT (tenant_id, task_key)
         DO UPDATE SET status='OPEN', completed_at=NULL, outcome=EXCLUDED.outcome, updated_at=now()`,
        [
          input.principal.tenantId,
          `intake-mr:${intakeRecordId}:triage-v${assessment.assessment_version}`,
          intakeRecordId,
          JSON.stringify({
            assessmentId: assessment.id,
            assessmentVersion: assessment.assessment_version,
            qcApproved: true,
          }),
          input.principal.userId,
        ],
      );
    } else {
      await client.query(
        `UPDATE safety_intake_records
            SET status = 'READY_FOR_DISPOSITION',
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, intakeRecordId, input.principal.userId],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getIntakeLifecycleReviewWorkspace({
    principal: input.principal,
    intakeRecordId,
    reviewType: input.reviewType,
  });
}

export async function assertIntakeLifecycleReviewsApproved(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<void> {
  const assessmentResult = await getPostgresPool().query<{ assessment_version: number }>(
    `SELECT assessment_version
       FROM safety_triage_assessments
      WHERE tenant_id = $1 AND intake_record_id = $2
      ORDER BY assessment_version DESC
      LIMIT 1`,
    [input.principal.tenantId, input.intakeRecordId],
  );
  const assessmentVersion = assessmentResult.rows[0]?.assessment_version;
  if (!assessmentVersion) throw new Error("A completed triage assessment is required before disposition.");

  const approvals = await getPostgresPool().query<{ task_type: string; outcome: Record<string, unknown> }>(
    `SELECT task_type, outcome
       FROM safety_review_tasks
      WHERE tenant_id = $1
        AND entity_type = 'INTAKE_RECORD'
        AND entity_id = $2
        AND task_type IN ('QC','MEDICAL_REVIEW')
        AND status = 'COMPLETED'
      ORDER BY completed_at DESC`,
    [input.principal.tenantId, input.intakeRecordId],
  );

  const approved = new Set<string>();
  for (const row of approvals.rows) {
    const outcome = object(row.outcome);
    if (
      Number(outcome.assessmentVersion ?? 0) === Number(assessmentVersion) &&
      outcome.action === "APPROVE"
    ) {
      approved.add(row.task_type);
    }
  }

  if (!approved.has("QC")) {
    throw new Error("Intake QC approval is required before disposition.");
  }
  if (!approved.has("MEDICAL_REVIEW")) {
    throw new Error("Intake Medical Review approval is required before disposition.");
  }
}
