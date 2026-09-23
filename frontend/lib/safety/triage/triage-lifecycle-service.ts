import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import {
  finalizeTriageAssessment,
  getTriageWorkspace,
  type TriageWorkspace,
} from "./triage-service";
import type { FinalTriageDecision } from "./triage-types";

export async function finalizeLifecycleTriageAssessment(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  decision: FinalTriageDecision;
}): Promise<TriageWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const precheck = await getPostgresPool().query<{
    duplicate_review_status: string;
    case_relationship: string | null;
  }>(
    `SELECT duplicate_review_status, case_relationship
       FROM safety_intake_records
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [input.principal.tenantId, intakeRecordId],
  );
  const row = precheck.rows[0];
  if (!row) throw new Error("Safety Intake was not found in the active tenant.");
  if (row.duplicate_review_status !== "COMPLETE") {
    throw new Error("Duplicate/follow-up review must be COMPLETE before formal ICSR triage.");
  }
  if (row.case_relationship === "DUPLICATE") {
    throw new Error("A confirmed duplicate cannot enter the Intake & Triage lifecycle.");
  }

  await finalizeTriageAssessment(input);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const assessment = await client.query<{
      assessment_version: number;
      id: string;
      human_validity_decision: string;
      seriousness_status: string;
      triage_outcome: string;
    }>(
      `SELECT id, assessment_version, human_validity_decision,
              seriousness_status, triage_outcome
         FROM safety_triage_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId],
    );
    const latest = assessment.rows[0];
    if (!latest) throw new Error("Triage assessment was not persisted.");

    const normalizedOutcome =
      latest.triage_outcome === "READY_FOR_DUPLICATE_REVIEW"
        ? "READY_FOR_QC"
        : latest.triage_outcome;

    if (normalizedOutcome !== latest.triage_outcome) {
      await client.query(
        `UPDATE safety_triage_assessments
            SET triage_outcome = $4
          WHERE tenant_id = $1 AND intake_record_id = $2 AND id = $3`,
        [input.principal.tenantId, intakeRecordId, latest.id, normalizedOutcome],
      );
    }

    await client.query(
      `UPDATE safety_intake_records
          SET status = 'VALIDITY_REVIEW',
              triage_outcome = $4,
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, intakeRecordId, input.principal.userId, normalizedOutcome],
    );

    await client.query(
      `INSERT INTO safety_review_tasks (
         tenant_id, task_key, entity_type, entity_id, task_type,
         status, outcome, created_by
       ) VALUES ($1,$2,'INTAKE_RECORD',$3,'QC','OPEN',$4::jsonb,$5)
       ON CONFLICT (tenant_id, task_key)
       DO UPDATE SET
         status = 'OPEN',
         completed_at = NULL,
         outcome = EXCLUDED.outcome,
         updated_at = now()`,
      [
        input.principal.tenantId,
        `intake-qc:${intakeRecordId}:triage-v${latest.assessment_version}`,
        intakeRecordId,
        JSON.stringify({
          assessmentId: latest.id,
          assessmentVersion: latest.assessment_version,
          lifecycleStage: "INTAKE_TRIAGE_QC",
        }),
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_TRIAGE_ROUTED_TO_QC','NEXUS_INTAKE_LIFECYCLE','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          assessmentId: latest.id,
          assessmentVersion: latest.assessment_version,
          validity: latest.human_validity_decision,
          seriousness: latest.seriousness_status,
          triageOutcome: normalizedOutcome,
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

  return getTriageWorkspace({ principal: input.principal, intakeRecordId });
}
