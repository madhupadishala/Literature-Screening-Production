import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { extractPatientSuggestions } from "@/lib/ai/patient-extraction-agent";
import { validateAuditReason } from "@/lib/audit/reason";
import { getPostgresPool } from "@/lib/database/postgres";
import type { PatientExtractionExecution } from "@/lib/literature/review/patient-extraction-types";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function runPatientExtraction(input: {
  principal: RequestPrincipal;
  workspaceId: string;
  reason: string;
}): Promise<PatientExtractionExecution> {
  const auditReason = validateAuditReason(input.reason);
  if (!auditReason.valid) {
    throw new Error(auditReason.message || "A specific audit reason is required.");
  }
  if (!input.workspaceId?.trim()) throw new Error("workspaceId is required.");

  const pool = getPostgresPool();
  const sourceResult = await pool.query<{
    workspace_id: string;
    workspace_status: string;
    package_id: string;
    screening_result_id: string;
    article_identity: unknown;
    screening_payload: unknown;
  }>(
    `SELECT
       workspace.id AS workspace_id,
       workspace.status AS workspace_status,
       workspace.package_id,
       workspace.screening_result_id,
       package.article_identity,
       screening.result_payload AS screening_payload
     FROM literature_review_workspaces workspace
     JOIN literature_packages package
       ON package.id = workspace.package_id
      AND package.tenant_id = workspace.tenant_id
     JOIN screening_results screening
       ON screening.id = workspace.screening_result_id
      AND screening.tenant_id = workspace.tenant_id
     WHERE workspace.tenant_id = $1
       AND workspace.id = $2
     LIMIT 1`,
    [input.principal.tenantId, input.workspaceId],
  );

  const target = sourceResult.rows[0];
  if (!target) throw new Error("Review workspace was not found in the active tenant.");
  if (target.workspace_status === "REVIEW_COMPLETE") {
    throw new Error("Completed Review workspace cannot run patient extraction.");
  }

  const article = isRecord(target.article_identity) ? target.article_identity : {};
  const title = text(article.title);
  const abstractText = text(article.abstract);
  const pmid = text(article.pmid);
  if (!title && !abstractText) {
    throw new Error("Patient extraction requires source article title or abstract text.");
  }

  const screeningPayload = isRecord(target.screening_payload)
    ? target.screening_payload
    : {};
  const screeningContext = isRecord(screeningPayload.result)
    ? screeningPayload.result
    : {};

  const correlationId = "review-patient-" + randomUUID();
  const ai = await extractPatientSuggestions({
    tenantId: input.principal.tenantId,
    correlationId,
    pmid: pmid || undefined,
    article: { title, abstractText },
    screeningContext,
  });

  const sourceSha256 = createHash("sha256")
    .update(JSON.stringify(ai.source))
    .digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const versionResult = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(run_version), 0) + 1 AS next_version
       FROM literature_patient_extraction_runs
       WHERE tenant_id = $1 AND review_workspace_id = $2`,
      [input.principal.tenantId, target.workspace_id],
    );
    const runVersion = Number(versionResult.rows[0].next_version);

    const execution = await client.query<{ id: string }>(
      `INSERT INTO ai_executions (
         tenant_id, package_id, execution_type, provider, model, request_id,
         input_sha256, status, latency_ms, token_usage, created_at, completed_at
       ) VALUES ($1,$2,'review_patient_extraction',$3,$4,$5,$6,'succeeded',$7,$8::jsonb,now(),now())
       RETURNING id`,
      [
        input.principal.tenantId,
        target.package_id,
        ai.aiExecution.provider,
        ai.aiExecution.model,
        ai.aiExecution.requestId,
        sourceSha256,
        ai.aiExecution.latencyMs,
        JSON.stringify({
          promptTokens: ai.aiExecution.promptTokens,
          completionTokens: ai.aiExecution.completionTokens,
          totalTokens: ai.aiExecution.totalTokens,
          attempts: ai.aiExecution.attempts,
        }),
      ],
    );

    const stored = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO literature_patient_extraction_runs (
         tenant_id, review_workspace_id, package_id, screening_result_id,
         run_version, extraction_payload, source_sha256, confidence,
         provider, model, request_id, reason, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, created_at`,
      [
        input.principal.tenantId,
        target.workspace_id,
        target.package_id,
        target.screening_result_id,
        runVersion,
        JSON.stringify({
          result: ai.result,
          source: ai.source,
          aiExecutionId: execution.rows[0].id,
          correlationId,
        }),
        sourceSha256,
        ai.result.confidence / 100,
        ai.aiExecution.provider,
        ai.aiExecution.model,
        ai.aiExecution.requestId,
        auditReason.reason,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category,
         outcome, request_id, correlation_id, details
       ) VALUES ($1,$2,$3,'REVIEW_PATIENT_EXTRACTION_COMPLETED',
         'LITERATURE_REVIEW','success',$4,$5,$6::jsonb)`,
      [
        input.principal.tenantId,
        target.package_id,
        input.principal.userId,
        ai.aiExecution.requestId,
        correlationId,
        JSON.stringify({
          reviewWorkspaceId: target.workspace_id,
          patientExtractionRunId: stored.rows[0].id,
          runVersion,
          classification: ai.result.classification,
          suggestedPatientCount: ai.result.patients.length,
          sourceSha256,
          reason: auditReason.reason,
          humanConfirmationRequired: true,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      ...ai.result,
      runId: stored.rows[0].id,
      runVersion,
      sourceSha256,
      provider: ai.aiExecution.provider,
      model: ai.aiExecution.model,
      requestId: ai.aiExecution.requestId,
      createdAt: stored.rows[0].created_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
