import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { assertIntakeLifecycleReviewsApproved } from "@/lib/safety/intake/intake-lifecycle-review-service";
import {
  finalizeIntakeDisposition,
  getDispositionWorkspace,
  type DispositionWorkspace,
} from "./disposition-service";
import type { IntakeDispositionRequest } from "./disposition-types";

async function loadLifecycleState(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<{ caseRelationship: string | null; dispositionStatus: string }> {
  const result = await getPostgresPool().query<{
    case_relationship: string | null;
    disposition_status: string;
  }>(
    `SELECT case_relationship, disposition_status
       FROM safety_intake_records
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1`,
    [input.principal.tenantId, input.intakeRecordId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Safety Intake was not found in the active tenant.");
  return {
    caseRelationship: row.case_relationship,
    dispositionStatus: row.disposition_status,
  };
}

async function getDuplicateDispositionWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<DispositionWorkspace> {
  const [intakeResult, dispositionResult] = await Promise.all([
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT intake.*, source.source_type, source.source_system,
              source.external_reference AS source_external_reference,
              source.received_at, source.source_payload, source.source_sha256
         FROM safety_intake_records intake
         JOIN safety_sources source
           ON source.id = intake.source_id
          AND source.tenant_id = intake.tenant_id
        WHERE intake.tenant_id = $1 AND intake.id = $2
        LIMIT 1`,
      [input.principal.tenantId, input.intakeRecordId],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT * FROM safety_intake_dispositions
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY disposition_version DESC
        LIMIT 1`,
      [input.principal.tenantId, input.intakeRecordId],
    ),
  ]);

  const intake = intakeResult.rows[0];
  if (!intake) throw new Error("Safety Intake was not found in the active tenant.");
  if (String(intake.case_relationship) !== "DUPLICATE") {
    throw new Error("Duplicate disposition is only available for a confirmed duplicate.");
  }

  const latest = dispositionResult.rows[0];
  return {
    intake,
    caseProcessingEnabled: false,
    allowedDispositions:
      String(intake.disposition_status) === "COMPLETE" ? [] : ["DUPLICATE"],
    latestDisposition: latest
      ? {
          id: String(latest.id),
          dispositionVersion: Number(latest.disposition_version),
          dispositionType: "DUPLICATE",
          targetCaseId: latest.target_case_id ? String(latest.target_case_id) : null,
          targetIntakeRecordId: latest.target_intake_record_id
            ? String(latest.target_intake_record_id)
            : null,
          externalSystem: latest.external_system ? String(latest.external_system) : null,
          externalCaseReference: latest.external_case_reference
            ? String(latest.external_case_reference)
            : null,
          externalHandoffPackageId: latest.external_handoff_package_id
            ? String(latest.external_handoff_package_id)
            : null,
          rationale: String(latest.rationale),
          metadata:
            latest.metadata && typeof latest.metadata === "object" && !Array.isArray(latest.metadata)
              ? (latest.metadata as Record<string, unknown>)
              : {},
          disposedAt: new Date(String(latest.disposed_at)).toISOString(),
        }
      : null,
    latestHandoff: null,
    createdCase: null,
  };
}

async function finalizeDuplicateDisposition(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  request: IntakeDispositionRequest;
}): Promise<DispositionWorkspace> {
  if (input.request.dispositionType !== "DUPLICATE") {
    throw new Error("A confirmed duplicate can only be dispositioned as DUPLICATE.");
  }
  const rationale = input.request.rationale.trim();
  if (rationale.length < 10) {
    throw new Error("Disposition rationale must contain at least 10 characters.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const intakeResult = await client.query<Record<string, unknown>>(
      `SELECT * FROM safety_intake_records
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1 FOR UPDATE`,
      [input.principal.tenantId, input.intakeRecordId],
    );
    const intake = intakeResult.rows[0];
    if (!intake) throw new Error("Safety Intake was not found in the active tenant.");
    if (String(intake.case_relationship) !== "DUPLICATE") {
      throw new Error("The Intake record is not a confirmed duplicate.");
    }
    if (String(intake.duplicate_review_status) !== "COMPLETE") {
      throw new Error("Duplicate review must be complete before duplicate disposition.");
    }
    if (String(intake.disposition_status) === "COMPLETE") {
      throw new Error("Intake disposition is already complete.");
    }

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(disposition_version),0)+1 AS next_version
         FROM safety_intake_dispositions
        WHERE tenant_id = $1 AND intake_record_id = $2`,
      [input.principal.tenantId, input.intakeRecordId],
    );

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO safety_intake_dispositions (
         tenant_id, intake_record_id, disposition_version, disposition_type,
         target_case_id, target_intake_record_id, external_case_reference,
         rationale, metadata, disposed_by
       ) VALUES ($1,$2,$3,'DUPLICATE',$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING id`,
      [
        input.principal.tenantId,
        input.intakeRecordId,
        Number(nextVersion.rows[0].next_version),
        intake.matched_case_id ?? null,
        intake.matched_intake_record_id ?? null,
        intake.matched_external_reference ?? null,
        rationale,
        JSON.stringify(input.request.metadata ?? {}),
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_intake_records
          SET disposition_status = 'COMPLETE',
              disposition_type = 'DUPLICATE',
              disposed_at = now(),
              disposed_by = $3,
              status = 'DISPOSED',
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, input.intakeRecordId, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_DUPLICATE_DISPOSITION_FINALIZED',
         'NEXUS_INTAKE_DISPOSITION','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId: input.intakeRecordId,
          dispositionId: inserted.rows[0].id,
          dispositionType: "DUPLICATE",
          matchedCaseId: intake.matched_case_id ?? null,
          matchedIntakeRecordId: intake.matched_intake_record_id ?? null,
          rationale,
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

  return getDuplicateDispositionWorkspace({
    principal: input.principal,
    intakeRecordId: input.intakeRecordId,
  });
}

export async function getReviewedDispositionWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<DispositionWorkspace> {
  const state = await loadLifecycleState(input);
  if (state.caseRelationship === "DUPLICATE") {
    return getDuplicateDispositionWorkspace(input);
  }
  await assertIntakeLifecycleReviewsApproved(input);
  return getDispositionWorkspace(input);
}

export async function finalizeReviewedIntakeDisposition(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  request: IntakeDispositionRequest;
}): Promise<DispositionWorkspace> {
  const state = await loadLifecycleState({
    principal: input.principal,
    intakeRecordId: input.intakeRecordId,
  });
  if (state.caseRelationship === "DUPLICATE") {
    return finalizeDuplicateDisposition(input);
  }
  await assertIntakeLifecycleReviewsApproved({
    principal: input.principal,
    intakeRecordId: input.intakeRecordId,
  });
  return finalizeIntakeDisposition(input);
}
