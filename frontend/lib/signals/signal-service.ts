import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";

import {
  SIGNAL_SOURCE_TYPES,
  type CreateSignalRequest,
  type RecordSignalAssessmentRequest,
  type SignalStatus,
} from "./signal-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, label: string, minimum = 1): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum) {
    throw new Error(`${label} must contain at least ${minimum} character${minimum === 1 ? "" : "s"}.`);
  }
  return normalized;
}

function validateCreateRequest(request: CreateSignalRequest): CreateSignalRequest {
  if (!(SIGNAL_SOURCE_TYPES as readonly string[]).includes(request.sourceType)) {
    throw new Error("A supported signal sourceType is required.");
  }
  const detectedAtText = requireText(request.detectedAt, "detectedAt");
  const detectedAt = new Date(detectedAtText);
  if (!Number.isFinite(detectedAt.getTime())) {
    throw new Error("detectedAt must be a valid date/time.");
  }
  if (request.detectionSnapshot !== undefined && !isRecord(request.detectionSnapshot)) {
    throw new Error("detectionSnapshot must be a JSON object.");
  }
  if (
    request.priority !== undefined &&
    !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(request.priority)
  ) {
    throw new Error("Unsupported signal priority.");
  }
  return {
    signalKey: requireText(request.signalKey, "signalKey"),
    productKey: requireText(request.productKey, "productKey"),
    eventTerm: requireText(request.eventTerm, "eventTerm"),
    sourceType: request.sourceType,
    sourceReference: request.sourceReference?.trim() || undefined,
    detectionMethod: requireText(request.detectionMethod, "detectionMethod"),
    detectionSnapshot: request.detectionSnapshot ?? {},
    priority: request.priority ?? "NORMAL",
    detectedAt: detectedAt.toISOString(),
    reason: requireText(request.reason, "reason", 10),
  };
}

const ALLOWED_TRANSITIONS: Readonly<Record<SignalStatus, readonly SignalStatus[]>> = {
  DETECTED: ["VALIDATED", "REFUTED"],
  VALIDATED: ["UNDER_EVALUATION", "REFUTED"],
  UNDER_EVALUATION: ["CONFIRMED", "REFUTED"],
  CONFIRMED: ["CLOSED"],
  REFUTED: ["CLOSED"],
  CLOSED: [],
};

async function loadSignalForUpdate(
  client: PoolClient,
  principal: RequestPrincipal,
  signalId: string,
): Promise<{ id: string; status: SignalStatus }> {
  const scope = requireSafetyWorkspaceScope(principal);
  const result = await client.query<{ id: string; status: SignalStatus }>(
    `SELECT id, status
       FROM nexus_signal_records
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND environment = $3
        AND id = $4
      FOR UPDATE`,
    [principal.tenantId, scope.workspaceId, scope.environment, signalId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Signal was not found in the selected client workspace/environment.");
  }
  return row;
}

export async function createSignal(input: {
  principal: RequestPrincipal;
  request: CreateSignalRequest;
}): Promise<Record<string, unknown>> {
  const request = validateCreateRequest(input.request);
  const scope = requireSafetyWorkspaceScope(input.principal);
  const snapshotSha256 = canonicalSha256(request.detectionSnapshot ?? {});
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `INSERT INTO nexus_signal_records (
       id, tenant_id, workspace_id, environment, signal_key,
       product_key, event_term, source_type, source_reference,
       detection_method, detection_snapshot, snapshot_sha256,
       priority, status, detected_at, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,'DETECTED',$14,$15)
     ON CONFLICT (tenant_id, workspace_id, environment, signal_key)
     DO UPDATE SET signal_key = nexus_signal_records.signal_key
     RETURNING *`,
    [
      randomUUID(),
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      request.signalKey,
      request.productKey,
      request.eventTerm,
      request.sourceType,
      request.sourceReference ?? null,
      request.detectionMethod,
      JSON.stringify(request.detectionSnapshot ?? {}),
      snapshotSha256,
      request.priority ?? "NORMAL",
      request.detectedAt,
      input.principal.userId,
    ],
  );
  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, workspace_id, environment, module_key, actor_id,
       event_type, event_category, outcome, details
     ) VALUES ($1,$2,$3,'SIGNAL_MANAGEMENT',$4,
       'SIGNAL_CREATED','NEXUS_SIGNALS','success',$5::jsonb)`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      input.principal.userId,
      JSON.stringify({
        signalId: result.rows[0].id,
        signalKey: request.signalKey,
        sourceType: request.sourceType,
        snapshotSha256,
        reason: request.reason,
      }),
    ],
  );
  return result.rows[0];
}

export async function listSignals(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT id, signal_key, product_key, event_term, source_type, source_reference,
            detection_method, snapshot_sha256, priority, status, detected_at,
            created_at, updated_at
       FROM nexus_signal_records
      WHERE tenant_id = $1 AND workspace_id = $2 AND environment = $3
      ORDER BY updated_at DESC
      LIMIT $4`,
    [input.principal.tenantId, scope.workspaceId, scope.environment, limit],
  );
  return result.rows;
}

export async function getSignal(input: {
  principal: RequestPrincipal;
  signalId: string;
}): Promise<Record<string, unknown>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT signal.*,
            COALESCE(
              (SELECT jsonb_agg(assessment ORDER BY assessment.assessment_version)
                 FROM nexus_signal_assessments assessment
                WHERE assessment.signal_id = signal.id),
              '[]'::jsonb
            ) AS assessments
       FROM nexus_signal_records signal
      WHERE signal.tenant_id = $1
        AND signal.workspace_id = $2
        AND signal.environment = $3
        AND signal.id = $4
      LIMIT 1`,
    [input.principal.tenantId, scope.workspaceId, scope.environment, input.signalId],
  );
  if (!result.rows[0]) {
    throw new Error("Signal was not found in the selected client workspace/environment.");
  }
  return result.rows[0];
}

export async function recordSignalAssessment(input: {
  principal: RequestPrincipal;
  signalId: string;
  request: RecordSignalAssessmentRequest;
}): Promise<Record<string, unknown>> {
  const rationale = requireText(input.request.rationale, "rationale", 10);
  const outcome = requireText(input.request.outcome, "outcome");
  if (!["VALIDATION","PRIORITIZATION","EVALUATION","RECOMMENDATION","CLOSURE"].includes(input.request.assessmentType)) {
    throw new Error("Unsupported signal assessmentType.");
  }
  if (input.request.evidence !== undefined && !isRecord(input.request.evidence)) {
    throw new Error("Signal assessment evidence must be a JSON object.");
  }
  const evidence = input.request.evidence ?? {};
  const evidenceSha256 = canonicalSha256(evidence);
  const scope = requireSafetyWorkspaceScope(input.principal);
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const signal = await loadSignalForUpdate(client, input.principal, input.signalId);

    if (input.request.nextStatus) {
      const allowed = ALLOWED_TRANSITIONS[signal.status];
      if (!allowed.includes(input.request.nextStatus)) {
        throw new Error(
          `Invalid signal transition from ${signal.status} to ${input.request.nextStatus}.`,
        );
      }
    }

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(assessment_version), 0) + 1 AS next_version
         FROM nexus_signal_assessments
        WHERE signal_id = $1`,
      [signal.id],
    );

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO nexus_signal_assessments (
         tenant_id, workspace_id, environment, signal_id,
         assessment_type, outcome, rationale, evidence, evidence_sha256,
         assessment_version, next_status, assessed_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
       RETURNING *`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        signal.id,
        input.request.assessmentType,
        outcome,
        rationale,
        JSON.stringify(evidence),
        evidenceSha256,
        Number(nextVersion.rows[0].next_version),
        input.request.nextStatus ?? null,
        input.principal.userId,
      ],
    );

    if (input.request.nextStatus) {
      await client.query(
        `UPDATE nexus_signal_records
            SET status = $2, updated_at = now()
          WHERE id = $1`,
        [signal.id, input.request.nextStatus],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES ($1,$2,$3,'SIGNAL_MANAGEMENT',$4,
         'SIGNAL_ASSESSMENT_RECORDED','NEXUS_SIGNALS','success',$5::jsonb)`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.principal.userId,
        JSON.stringify({
          signalId: signal.id,
          assessmentType: input.request.assessmentType,
          assessmentOutcome: outcome,
          priorStatus: signal.status,
          nextStatus: input.request.nextStatus ?? signal.status,
          evidenceSha256,
        }),
      ],
    );

    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
