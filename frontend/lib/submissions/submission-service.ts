import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";

import {
  SUBMISSION_ACK_STATUSES,
  SUBMISSION_DESTINATION_TYPES,
  type CreateSubmissionRequest,
  type RecordAcknowledgementRequest,
  type SubmissionDestinationType,
  type SubmissionTransportAdapter,
} from "./submission-types";

const transportAdapters = new Map<string, SubmissionTransportAdapter>();
const TRANSPORT_TIMEOUT_MS = 30_000;
const STALE_TRANSMISSION_MS = 5 * 60_000;

async function withTransportTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS);
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Submission transport timed out.")),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function registerSubmissionTransportAdapter(
  adapter: SubmissionTransportAdapter,
): void {
  if (!adapter.key.trim()) {
    throw new Error("Submission transport adapter requires a stable key.");
  }
  transportAdapters.set(adapter.key, adapter);
}

function requireText(
  value: unknown,
  label: string,
  minimum = 1,
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimum) {
    throw new Error(
      `${label} must contain at least ${minimum} character${minimum === 1 ? "" : "s"}.`,
    );
  }
  return normalized;
}

function isDestinationType(
  value: string,
): value is SubmissionDestinationType {
  return (SUBMISSION_DESTINATION_TYPES as readonly string[]).includes(value);
}

function validateCreateRequest(
  request: CreateSubmissionRequest,
): CreateSubmissionRequest {
  if (!isDestinationType(request.destinationType)) {
    throw new Error("A supported submission destinationType is required.");
  }
  return {
    caseId: requireText(request.caseId, "caseId"),
    destinationType: request.destinationType,
    destinationKey: requireText(request.destinationKey, "destinationKey"),
    messageProfile: requireText(
      request.messageProfile ?? "ICH_E2B_R3",
      "messageProfile",
    ),
    idempotencyKey: requireText(
      request.idempotencyKey,
      "idempotencyKey",
      8,
    ),
    reason: requireText(request.reason, "reason", 10),
  };
}

async function loadFinalCaseForSubmission(
  client: PoolClient,
  principal: RequestPrincipal,
  caseId: string,
): Promise<{
  caseId: string;
  caseKey: string;
  caseStatus: string;
  caseVersionId: string;
  caseVersion: number;
  schemaVersion: string;
  e2bProfile: string;
  casePayload: Record<string, unknown>;
  caseSha256: string;
}> {
  const scope = requireSafetyWorkspaceScope(principal);
  const result = await client.query<{
    id: string;
    case_key: string;
    case_status: string;
    version_id: string;
    version: number;
    schema_version: string;
    e2b_profile: string;
    case_payload: Record<string, unknown>;
    case_sha256: string;
  }>(
    `SELECT safety_case.id, safety_case.case_key, safety_case.case_status,
            version.id AS version_id, version.version, version.schema_version,
            version.e2b_profile, version.case_payload, version.case_sha256
       FROM safety_cases safety_case
       JOIN safety_case_versions version
         ON version.id = safety_case.final_version_id
        AND version.tenant_id = safety_case.tenant_id
      WHERE safety_case.tenant_id = $1
        AND safety_case.workspace_id = $2
        AND safety_case.environment = $3
        AND safety_case.id = $4
        AND safety_case.case_status IN ('FINALIZED','SUBMITTED','CLOSED')
      LIMIT 1`,
    [
      principal.tenantId,
      scope.workspaceId,
      scope.environment,
      caseId,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(
      "A finalized safety case in the selected client workspace/environment is required.",
    );
  }

  return {
    caseId: row.id,
    caseKey: row.case_key,
    caseStatus: row.case_status,
    caseVersionId: row.version_id,
    caseVersion: Number(row.version),
    schemaVersion: row.schema_version,
    e2bProfile: row.e2b_profile,
    casePayload: row.case_payload,
    caseSha256: row.case_sha256,
  };
}

function packagePayload(input: {
  finalCase: Awaited<ReturnType<typeof loadFinalCaseForSubmission>>;
  request: CreateSubmissionRequest;
}): Record<string, unknown> {
  return {
    profile: "NEXUS_SUBMISSION_PACKAGE",
    schemaVersion: "1.0.0",
    source: {
      caseId: input.finalCase.caseId,
      caseKey: input.finalCase.caseKey,
      caseVersionId: input.finalCase.caseVersionId,
      caseVersion: input.finalCase.caseVersion,
      caseSchemaVersion: input.finalCase.schemaVersion,
      caseE2bProfile: input.finalCase.e2bProfile,
      caseSha256: input.finalCase.caseSha256,
    },
    destination: {
      type: input.request.destinationType,
      key: input.request.destinationKey,
      messageProfile: input.request.messageProfile ?? "ICH_E2B_R3",
    },
    casePayload: input.finalCase.casePayload,
  };
}

function submissionKey(input: {
  caseId: string;
  caseVersionId: string;
  destinationType: string;
  destinationKey: string;
  messageProfile: string;
}): string {
  return canonicalSha256(input).slice(0, 40);
}

export async function createSubmissionPackage(input: {
  principal: RequestPrincipal;
  request: CreateSubmissionRequest;
}): Promise<Record<string, unknown>> {
  const request = validateCreateRequest(input.request);
  const scope = requireSafetyWorkspaceScope(input.principal);
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");

    const idempotencyScopeKey = [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      request.idempotencyKey,
    ].join(":");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [idempotencyScopeKey],
    );

    const existing = await client.query<{
      case_id: string;
      destination_type: string;
      destination_key: string;
      message_profile: string;
      [key: string]: unknown;
    }>(
      `SELECT *
         FROM nexus_submission_packages
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND environment = $3
          AND idempotency_key = $4
        FOR UPDATE`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        request.idempotencyKey,
      ],
    );

    if (existing.rows[0]) {
      const stored = existing.rows[0];
      const sameRequest =
        stored.case_id === request.caseId &&
        stored.destination_type === request.destinationType &&
        stored.destination_key === request.destinationKey &&
        stored.message_profile === (request.messageProfile ?? "ICH_E2B_R3");
      if (!sameRequest) {
        throw new Error(
          "Idempotency conflict: this idempotencyKey is already bound to different submission data.",
        );
      }
      await client.query("COMMIT");
      return { ...stored, reused: true };
    }

    const finalCase = await loadFinalCaseForSubmission(
      client,
      input.principal,
      request.caseId,
    );
    const payload = packagePayload({ finalCase, request });
    const packageSha256 = canonicalSha256(payload);
    const key = submissionKey({
      caseId: finalCase.caseId,
      caseVersionId: finalCase.caseVersionId,
      destinationType: request.destinationType,
      destinationKey: request.destinationKey,
      messageProfile: request.messageProfile ?? "ICH_E2B_R3",
    });
    const id = randomUUID();

    const packageScopeKey = [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      key,
    ].join(":");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [packageScopeKey],
    );
    const equivalent = await client.query<{ id: string; idempotency_key: string }>(
      `SELECT id, idempotency_key
         FROM nexus_submission_packages
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND environment = $3
          AND submission_key = $4
        FOR UPDATE`,
      [input.principal.tenantId, scope.workspaceId, scope.environment, key],
    );
    if (equivalent.rows[0]) {
      throw new Error(
        "Submission conflict: an equivalent package already exists with a different idempotency key.",
      );
    }

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO nexus_submission_packages (
         id, tenant_id, workspace_id, environment,
         submission_key, idempotency_key,
         case_id, case_version_id,
         destination_type, destination_key, message_profile,
         status, package_payload, package_sha256, source_case_sha256,
         created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         'READY',$12::jsonb,$13,$14,$15
       )
       RETURNING *`,
      [
        id,
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        key,
        request.idempotencyKey,
        finalCase.caseId,
        finalCase.caseVersionId,
        request.destinationType,
        request.destinationKey,
        request.messageProfile ?? "ICH_E2B_R3",
        JSON.stringify(payload),
        packageSha256,
        finalCase.caseSha256,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,$3,'SUBMISSIONS',$4,
         'SUBMISSION_PACKAGE_CREATED','NEXUS_SUBMISSIONS','success',$5::jsonb
       )`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.principal.userId,
        JSON.stringify({
          submissionId: id,
          submissionKey: key,
          caseId: finalCase.caseId,
          caseVersionId: finalCase.caseVersionId,
          destinationType: request.destinationType,
          destinationKey: request.destinationKey,
          packageSha256,
          sourceCaseSha256: finalCase.caseSha256,
          reason: request.reason,
        }),
      ],
    );

    await client.query("COMMIT");
    return { ...inserted.rows[0], reused: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSubmissionPackages(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT id, submission_key, case_id, case_version_id,
            destination_type, destination_key, message_profile,
            status, package_sha256, source_case_sha256, created_at, updated_at
       FROM nexus_submission_packages
      WHERE tenant_id = $1
        AND workspace_id = $2
        AND environment = $3
      ORDER BY updated_at DESC
      LIMIT $4`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      limit,
    ],
  );
  return result.rows;
}

export async function getSubmissionPackage(input: {
  principal: RequestPrincipal;
  submissionId: string;
}): Promise<Record<string, unknown>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT package.*,
            COALESCE(
              (SELECT jsonb_agg(attempt ORDER BY attempt.attempt_number)
                 FROM nexus_submission_attempts attempt
                WHERE attempt.submission_package_id = package.id),
              '[]'::jsonb
            ) AS attempts,
            COALESCE(
              (SELECT jsonb_agg(ack ORDER BY ack.received_at)
                 FROM nexus_submission_acknowledgements ack
                WHERE ack.submission_package_id = package.id),
              '[]'::jsonb
            ) AS acknowledgements
       FROM nexus_submission_packages package
      WHERE package.tenant_id = $1
        AND package.workspace_id = $2
        AND package.environment = $3
        AND package.id = $4
      LIMIT 1`,
    [
      input.principal.tenantId,
      scope.workspaceId,
      scope.environment,
      input.submissionId,
    ],
  );
  if (!result.rows[0]) {
    throw new Error(
      "Submission package was not found in the selected client workspace/environment.",
    );
  }
  return result.rows[0];
}

function selectAdapter(input: {
  destinationType: SubmissionDestinationType;
  destinationKey: string;
  messageProfile: string;
}): SubmissionTransportAdapter | undefined {
  return [...transportAdapters.values()].find((adapter) =>
    adapter.supports(input),
  );
}

export async function transmitSubmission(input: {
  principal: RequestPrincipal;
  submissionId: string;
}): Promise<Record<string, unknown>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const selected = await client.query<{
      id: string;
      submission_key: string;
      destination_type: SubmissionDestinationType;
      destination_key: string;
      message_profile: string;
      status: string;
      package_payload: Record<string, unknown>;
      package_sha256: string;
    }>(
      `SELECT id, submission_key, destination_type, destination_key,
              message_profile, status, package_payload, package_sha256
         FROM nexus_submission_packages
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND environment = $3
          AND id = $4
        FOR UPDATE`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.submissionId,
      ],
    );
    const row = selected.rows[0];
    if (!row) {
      throw new Error(
        "Submission package was not found in the selected client workspace/environment.",
      );
    }
    if (row.status === "TRANSMITTING") {
      const latestAttempt = await client.query<{
        id: string;
        status: string;
        started_at: Date | string;
      }>(
        `SELECT id, status, started_at
           FROM nexus_submission_attempts
          WHERE submission_package_id = $1
          ORDER BY attempt_number DESC
          LIMIT 1
          FOR UPDATE`,
        [row.id],
      );
      const latest = latestAttempt.rows[0];
      const startedAt = latest ? new Date(latest.started_at).getTime() : Number.NaN;
      const stale =
        latest?.status === "STARTED" &&
        Number.isFinite(startedAt) &&
        Date.now() - startedAt >= STALE_TRANSMISSION_MS;
      if (!stale) {
        throw new Error(
          "Submission package is already transmitting and is not eligible for recovery.",
        );
      }
      await client.query(
        `UPDATE nexus_submission_attempts
            SET status = 'FAILED',
                error_code = 'STALE_TRANSMISSION_RECOVERED',
                error_message = 'A prior transmission attempt exceeded the recovery threshold.',
                completed_at = now()
          WHERE id = $1`,
        [latest.id],
      );
      await client.query(
        `UPDATE nexus_submission_packages
            SET status = 'FAILED', updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      row.status = "FAILED";
    }

    if (!["READY", "FAILED"].includes(row.status)) {
      throw new Error(
        `Submission package cannot be transmitted from status ${row.status}.`,
      );
    }

    const nextAttempt = await client.query<{ next_attempt: number }>(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
         FROM nexus_submission_attempts
        WHERE submission_package_id = $1`,
      [row.id],
    );
    const attemptNumber = Number(nextAttempt.rows[0].next_attempt);
    const adapter = selectAdapter({
      destinationType: row.destination_type,
      destinationKey: row.destination_key,
      messageProfile: row.message_profile,
    });
    const adapterKey = adapter?.key ?? "UNCONFIGURED";

    const attempt = await client.query<{ id: string }>(
      `INSERT INTO nexus_submission_attempts (
         tenant_id, workspace_id, environment, submission_package_id,
         attempt_number, transport_adapter_key, request_sha256,
         status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'STARTED',$8)
       RETURNING id`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        row.id,
        attemptNumber,
        adapterKey,
        row.package_sha256,
        input.principal.userId,
      ],
    );

    if (!adapter) {
      await client.query(
        `UPDATE nexus_submission_attempts
            SET status = 'FAILED',
                error_code = 'TRANSPORT_NOT_CONFIGURED',
                error_message = 'No governed transport adapter is configured for this destination.',
                completed_at = now()
          WHERE id = $1`,
        [attempt.rows[0].id],
      );
      await client.query(
        `UPDATE nexus_submission_packages
            SET status = 'FAILED', updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      await client.query("COMMIT");
      throw new Error(
        "No governed submission transport adapter is configured for this destination.",
      );
    }

    await client.query(
      `UPDATE nexus_submission_packages
          SET status = 'TRANSMITTING', updated_at = now()
        WHERE id = $1`,
      [row.id],
    );
    await client.query("COMMIT");

    try {
      const transmitted = await withTransportTimeout((signal) =>
        adapter.transmit({
          submissionId: row.id,
          submissionKey: row.submission_key,
          destinationType: row.destination_type,
          destinationKey: row.destination_key,
          messageProfile: row.message_profile,
          packagePayload: row.package_payload,
          packageSha256: row.package_sha256,
          signal,
        }),
      );

      await getPostgresPool().query(
        `WITH attempt_update AS (
           UPDATE nexus_submission_attempts
              SET status = 'SUCCEEDED',
                  external_message_id = $2,
                  response_metadata = $3::jsonb,
                  completed_at = now()
            WHERE id = $1
            RETURNING submission_package_id
         )
         UPDATE nexus_submission_packages package
            SET status = 'TRANSMITTED', updated_at = now()
           FROM attempt_update
          WHERE package.id = attempt_update.submission_package_id`,
        [
          attempt.rows[0].id,
          transmitted.externalMessageId,
          JSON.stringify(transmitted.responseMetadata ?? {}),
        ],
      );

      return getSubmissionPackage({
        principal: input.principal,
        submissionId: row.id,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown transport failure.";
      await getPostgresPool().query(
        `WITH attempt_update AS (
           UPDATE nexus_submission_attempts
              SET status = 'FAILED',
                  error_code = 'TRANSPORT_FAILURE',
                  error_message = $2,
                  completed_at = now()
            WHERE id = $1
            RETURNING submission_package_id
         )
         UPDATE nexus_submission_packages package
            SET status = 'FAILED', updated_at = now()
           FROM attempt_update
          WHERE package.id = attempt_update.submission_package_id`,
        [attempt.rows[0].id, message.slice(0, 2000)],
      );
      throw error;
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordSubmissionAcknowledgement(input: {
  principal: RequestPrincipal;
  submissionId: string;
  request: RecordAcknowledgementRequest;
}): Promise<Record<string, unknown>> {
  const scope = requireSafetyWorkspaceScope(input.principal);
  if (
    !(SUBMISSION_ACK_STATUSES as readonly string[]).includes(
      input.request.ackStatus,
    )
  ) {
    throw new Error("A supported acknowledgement status is required.");
  }
  const externalAckId = requireText(
    input.request.externalAckId,
    "externalAckId",
  );
  const ackType = requireText(input.request.ackType, "ackType");
  const receivedAtText = requireText(input.request.receivedAt, "receivedAt");
  const receivedAt = new Date(receivedAtText);
  if (!Number.isFinite(receivedAt.getTime())) {
    throw new Error("receivedAt must be a valid date/time.");
  }
  const ackPayload = input.request.ackPayload ?? {};
  const ackSha256 = canonicalSha256(ackPayload);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ id: string; status: string }>(
      `SELECT id, status
         FROM nexus_submission_packages
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND environment = $3
          AND id = $4
        FOR UPDATE`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.submissionId,
      ],
    );
    if (!selected.rows[0]) {
      throw new Error(
        "Submission package was not found in the selected client workspace/environment.",
      );
    }

    const packageRow = selected.rows[0];
    if (!["TRANSMITTED", "ACKNOWLEDGED", "REJECTED"].includes(packageRow.status)) {
      throw new Error(
        `Acknowledgement cannot be recorded from status ${packageRow.status}.`,
      );
    }

    const priorAck = await client.query<{
      submission_package_id: string;
      ack_status: string;
      ack_type: string;
      ack_sha256: string;
      [key: string]: unknown;
    }>(
      `SELECT *
         FROM nexus_submission_acknowledgements
        WHERE tenant_id = $1
          AND workspace_id = $2
          AND environment = $3
          AND external_ack_id = $4
        FOR UPDATE`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        externalAckId,
      ],
    );

    if (priorAck.rows[0]) {
      const stored = priorAck.rows[0];
      if (
        stored.submission_package_id !== input.submissionId ||
        stored.ack_status !== input.request.ackStatus ||
        stored.ack_type !== ackType ||
        stored.ack_sha256 !== ackSha256
      ) {
        throw new Error(
          "Acknowledgement conflict: externalAckId is already bound to different acknowledgement data.",
        );
      }
      await client.query("COMMIT");
      return stored;
    }

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO nexus_submission_acknowledgements (
         tenant_id, workspace_id, environment, submission_package_id,
         external_ack_id, ack_type, ack_status, ack_payload,
         ack_sha256, received_at, recorded_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
       RETURNING *`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.submissionId,
        externalAckId,
        ackType,
        input.request.ackStatus,
        JSON.stringify(ackPayload),
        ackSha256,
        receivedAt.toISOString(),
        input.principal.userId,
      ],
    );

    const storedAckStatus = input.request.ackStatus;
    const packageStatus =
      storedAckStatus === "ACCEPTED"
        ? "ACKNOWLEDGED"
        : storedAckStatus === "REJECTED" || storedAckStatus === "TECHNICAL_ERROR"
          ? "REJECTED"
          : packageRow.status;

    if (packageStatus !== packageRow.status) {
      await client.query(
        `UPDATE nexus_submission_packages
            SET status = $2, updated_at = now()
          WHERE id = $1`,
        [input.submissionId, packageStatus],
      );
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, workspace_id, environment, module_key, actor_id,
         event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,$3,'SUBMISSIONS',$4,
         'SUBMISSION_ACKNOWLEDGEMENT_RECORDED',
         'NEXUS_SUBMISSIONS','success',$5::jsonb
       )`,
      [
        input.principal.tenantId,
        scope.workspaceId,
        scope.environment,
        input.principal.userId,
        JSON.stringify({
          submissionId: input.submissionId,
          externalAckId,
          ackType,
          ackStatus: input.request.ackStatus,
          ackSha256,
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
