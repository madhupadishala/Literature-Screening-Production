import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import {
  completeIntakeSourceReview,
  type IntakeWorkspace,
} from "@/lib/safety/intake/intake-review-service";

export async function completeIntakeSourceReviewAndOpenDuplicateGate(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reason: string;
}): Promise<IntakeWorkspace> {
  const workspace = await completeIntakeSourceReview(input);
  const intakeRecordId = input.intakeRecordId.trim();

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ source_review_status: string; duplicate_review_status: string }>(
      `SELECT source_review_status, duplicate_review_status
         FROM safety_intake_records
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Safety Intake was not found in the active tenant.");
    if (row.source_review_status !== "VERIFIED") {
      throw new Error("Source Review must be VERIFIED before duplicate review.");
    }

    if (row.duplicate_review_status !== "COMPLETE") {
      await client.query(
        `UPDATE safety_intake_records
            SET status = 'DUPLICATE_REVIEW',
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, intakeRecordId, input.principal.userId],
      );

      await client.query(
        `INSERT INTO safety_review_tasks (
           tenant_id, task_key, entity_type, entity_id, task_type,
           status, created_by
         ) VALUES ($1,$2,'INTAKE_RECORD',$3,'DUPLICATE_REVIEW','OPEN',$4)
         ON CONFLICT (tenant_id, task_key) DO NOTHING`,
        [
          input.principal.tenantId,
          `duplicate-review:${intakeRecordId}`,
          intakeRecordId,
          input.principal.userId,
        ],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_DUPLICATE_GATE_OPENED','NEXUS_INTAKE_LIFECYCLE','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          reason: input.reason.trim(),
          duplicateReviewStatus: row.duplicate_review_status,
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

  return workspace;
}
