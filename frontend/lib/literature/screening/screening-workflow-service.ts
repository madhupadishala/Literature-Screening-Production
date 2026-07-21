import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { screeningAgent } from "@/lib/ai/screening-agent";
import { screeningValidator } from "@/lib/ai/screening-validator";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import type {
  ScreeningDecision,
  ScreeningFinding,
  ScreeningReason,
  ScreeningRequest,
} from "./screening-types";
import type {
  ExecuteScreeningInput,
  SaveScreeningReviewInput,
  ScreeningReviewStatus,
  ScreeningWorkflowMutation,
  ScreeningWorklistRecord,
} from "./screening-workflow-types";

interface ScreeningQueueRow {
  package_id: string;
  package_key: string;
  external_reference: string | null;
  article_identity: Record<string, unknown>;
  product_context: Record<string, unknown>;
  workflow_state: string;
  state_payload: Record<string, unknown>;
  result_id: string | null;
  result_version: number | null;
  result_payload: Record<string, unknown> | null;
  confidence: string | number | null;
  review_status: ScreeningReviewStatus | null;
  final_decision: ScreeningDecision | null;
  review_version: number | null;
  comments: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  intake_export_id: string | null;
  intake_export_version: number | null;
  source_pmid: string | null;
  source_doi: string | null;
  source_title: string | null;
  source_journal: string | null;
  source_publication_date: string | null;
  source_authors: unknown;
  source_abstract: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function confidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed <= 1
    ? Math.max(0, Math.min(parsed * 100, 100))
    : Math.max(0, Math.min(parsed, 100));
}

function findings(value: unknown): ScreeningFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    rule: text(item.rule, "Unknown Rule"),
    passed: item.passed === true,
    score: confidence(item.score),
    comment: text(item.comment),
  }));
}

function decision(value: unknown): ScreeningDecision {
  return value === "INCLUDE" || value === "EXCLUDE" || value === "REVIEW" ? value : "REVIEW";
}

function reason(value: unknown): ScreeningReason {
  const allowed: ScreeningReason[] = [
    "CASE_REPORT",
    "ADVERSE_EVENT",
    "PRODUCT_MENTION",
    "HUMAN_STUDY",
    "ANIMAL_STUDY",
    "REVIEW_ARTICLE",
    "NO_ADVERSE_EVENT",
    "NON_MEDICAL",
    "INSUFFICIENT_INFORMATION",
    "NON_ENGLISH",
    "DUPLICATE",
    "UNKNOWN",
  ];
  return typeof value === "string" && allowed.includes(value as ScreeningReason)
    ? (value as ScreeningReason)
    : "UNKNOWN";
}

function productName(row: ScreeningQueueRow): string {
  const context = row.product_context || {};
  const resolved = recordValue(context.resolvedProduct);
  return (
    text(resolved.preferredName) ||
    text(context.productName) ||
    text(context.product_name) ||
    "Not identified"
  );
}

function mapQueueRow(row: ScreeningQueueRow): ScreeningWorklistRecord {
  const payload = recordValue(row.result_payload);
  const result = recordValue(payload.result);
  const identity = row.article_identity || {};
  const statePayload = row.state_payload || {};
  const executionFailed = statePayload.screeningExecutionFailed === true;
  const hasResult = Boolean(row.result_id);

  return {
    packageId: row.package_id,
    packageKey: row.package_key,
    screeningResultId: row.result_id || undefined,
    resultVersion: row.result_version || 0,
    pmid: row.source_pmid || text(identity.pmid) || row.external_reference || "—",
    doi: row.source_doi || text(identity.doi) || undefined,
    title: row.source_title || text(identity.title, "—"),
    journal: row.source_journal || text(identity.journal, "—"),
    publicationDate: row.source_publication_date || text(identity.publicationDate, "—"),
    authors: list(row.source_authors),
    abstractText: row.source_abstract || "",
    productName: productName(row),
    countryOfInterest: text(row.product_context?.countryOfInterest, "Uncertain"),
    workflowState: row.workflow_state,
    executionStatus: executionFailed ? "failed" : hasResult ? "completed" : "ready",
    decision: row.final_decision || decision(result.decision),
    confidence: confidence(row.confidence ?? result.confidence),
    reason: reason(result.reason),
    findings: findings(result.findings),
    qcRequired:
      executionFailed ||
      decision(result.decision) === "REVIEW" ||
      confidence(row.confidence ?? result.confidence) < 80,
    reviewStatus: row.review_status || "pending",
    reviewVersion: row.review_version || 0,
    intakeExportId: row.intake_export_id || undefined,
    intakeExportVersion: row.intake_export_version || undefined,
    reviewComments: row.comments || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reviewedBy: row.reviewed_by || undefined,
    aiExecution: isRecord(payload.aiExecution) ? payload.aiExecution : undefined,
    error: text(statePayload.error) || undefined,
  };
}

async function queueRow(input: {
  principal: RequestPrincipal;
  packageId: string;
}): Promise<ScreeningQueueRow> {
  const result = await getPostgresPool().query<ScreeningQueueRow>(
    `${queueSql()} AND package.id = $2 LIMIT 1`,
    [input.principal.tenantId, input.packageId],
  );
  if (!result.rows[0]) throw new Error("Screening package was not found in the active tenant.");
  return result.rows[0];
}

function queueSql(): string {
  return `
    WITH latest_screening AS (
      SELECT DISTINCT ON (package_id)
        id, tenant_id, package_id, result_version,
        result_payload, confidence, created_at
      FROM screening_results
      WHERE tenant_id = $1
      ORDER BY package_id, result_version DESC, created_at DESC
    ), latest_intake AS (
      SELECT DISTINCT ON (package_id) id, tenant_id, package_id, export_version
      FROM intake_input_exports
      WHERE tenant_id = $1
      ORDER BY package_id, export_version DESC, generated_at DESC
    )
    SELECT
      package.id AS package_id,
      package.package_key,
      package.external_reference,
      package.article_identity,
      package.product_context,
      workflow.workflow_state,
      workflow.state_payload,
      screening.id AS result_id,
      screening.result_version,
      screening.result_payload,
      screening.confidence,
      review.review_status,
      review.final_decision,
      review.review_version,
      review.comments,
      review.reviewed_at,
      reviewer.display_name AS reviewed_by,
      intake.id AS intake_export_id,
      intake.export_version AS intake_export_version,
      source.pmid AS source_pmid,
      source.doi AS source_doi,
      source.title AS source_title,
      source.journal AS source_journal,
      source.publication_date::text AS source_publication_date,
      source.authors AS source_authors,
      source.abstract_text AS source_abstract
    FROM literature_packages package
    JOIN literature_workflow_state workflow
      ON workflow.package_id = package.id AND workflow.tenant_id = package.tenant_id
    LEFT JOIN latest_screening screening
      ON screening.package_id = package.id AND screening.tenant_id = package.tenant_id
    LEFT JOIN screening_reviews review
      ON review.tenant_id = package.tenant_id
     AND review.package_id = package.id
     AND review.screening_result_id = screening.id
    LEFT JOIN application_users reviewer ON reviewer.id = review.reviewed_by
    LEFT JOIN latest_intake intake
      ON intake.package_id = package.id AND intake.tenant_id = package.tenant_id
    LEFT JOIN LATERAL (
      SELECT result.*
      FROM ad_hoc_literature_results result
      WHERE result.tenant_id = package.tenant_id
        AND result.evidence_package_id = package.id
      ORDER BY CASE WHEN result.pmid IS NOT NULL THEN 0 ELSE 1 END, result.created_at
      LIMIT 1
    ) source ON true
    WHERE package.tenant_id = $1
      AND workflow.workflow_state IN (
        'HITS_COMPLETE', 'SCREENING_RUNNING', 'SCREENING_REVIEW',
        'SCREENING_COMPLETE', 'INTAKE_INPUT_CREATED'
      )
  `;
}

export async function listScreeningWorklist(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<ScreeningWorklistRecord[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 250, 500));
  const result = await getPostgresPool().query<ScreeningQueueRow>(
    `${queueSql()} ORDER BY package.updated_at DESC LIMIT $2`,
    [input.principal.tenantId, limit],
  );
  return result.rows.map(mapQueueRow);
}

async function updateWorkflow(input: {
  principal: RequestPrincipal;
  packageId: string;
  state: "SCREENING_RUNNING" | "SCREENING_REVIEW";
  payload: Record<string, unknown>;
  eventType: string;
  outcome: string;
}): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE literature_packages SET status = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [input.packageId, input.principal.tenantId, input.state],
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = $3, state_version = state_version + 1,
           state_payload = state_payload || $4::jsonb,
           updated_by = $5, updated_at = now()
       WHERE package_id = $1 AND tenant_id = $2`,
      [
        input.packageId,
        input.principal.tenantId,
        input.state,
        JSON.stringify(input.payload),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type,
         event_category, outcome, details
       ) VALUES ($1, $2, $3, $4, 'LITERATURE_SCREENING', $5, $6::jsonb)`,
      [
        input.principal.tenantId,
        input.packageId,
        input.principal.userId,
        input.eventType,
        input.outcome,
        JSON.stringify(input.payload),
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

export async function executeScreening(input: {
  principal: RequestPrincipal;
  request: ExecuteScreeningInput;
}): Promise<ScreeningWorklistRecord> {
  const row = await queueRow({ principal: input.principal, packageId: input.request.packageId });
  if (row.workflow_state !== "HITS_COMPLETE" && row.workflow_state !== "SCREENING_REVIEW") {
    throw new Error(`Screening cannot run from workflow state ${row.workflow_state}.`);
  }
  const correlationId = `screening-${randomUUID()}`;
  await updateWorkflow({
    principal: input.principal,
    packageId: row.package_id,
    state: "SCREENING_RUNNING",
    payload: { screeningStartedAt: new Date().toISOString(), correlationId },
    eventType: "SCREENING_EXECUTION_STARTED",
    outcome: "started",
  });

  const request: ScreeningRequest = {
    tenantId: input.principal.tenantId,
    correlationId,
    article: {
      pmid: row.source_pmid || row.external_reference || row.package_key,
      doi: row.source_doi || undefined,
      title: row.source_title || text(row.article_identity?.title, "Untitled article"),
      abstract: row.source_abstract || "",
      authors: list(row.source_authors),
      journal: row.source_journal || undefined,
      publicationDate: row.source_publication_date || undefined,
      country: text(row.product_context?.countryOfInterest) || undefined,
    },
  };

  try {
    const aiResponse = await screeningAgent.screen(request);
    const validated = screeningValidator.validate(aiResponse);
    const client = await getPostgresPool().connect();

    try {
      await client.query("BEGIN");
      const execution = await client.query<{ id: string }>(
        `INSERT INTO ai_executions (
           tenant_id, package_id, execution_type, provider, model, request_id,
           input_sha256, status, latency_ms, token_usage, created_at, completed_at
         ) VALUES ($1, $2, 'screening', $3, $4, $5, $6, 'succeeded', $7, $8::jsonb, now(), now())
         RETURNING id`,
        [
          input.principal.tenantId,
          row.package_id,
          aiResponse.aiExecution.provider,
          aiResponse.aiExecution.model,
          aiResponse.aiExecution.requestId,
          createHash("sha256").update(JSON.stringify(request.article)).digest("hex"),
          aiResponse.aiExecution.latencyMs,
          JSON.stringify({
            promptTokens: aiResponse.aiExecution.promptTokens,
            completionTokens: aiResponse.aiExecution.completionTokens,
            totalTokens: aiResponse.aiExecution.totalTokens,
            attempts: aiResponse.aiExecution.attempts,
          }),
        ],
      );
      const version = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(result_version), 0) + 1 AS next_version
         FROM screening_results WHERE package_id = $1`,
        [row.package_id],
      );
      const nextVersion = Number(version.rows[0].next_version);
      const stored = await client.query<{ id: string }>(
        `INSERT INTO screening_results (
           tenant_id, package_id, execution_id, result_version,
           decision, result_payload, confidence
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
        [
          input.principal.tenantId,
          row.package_id,
          execution.rows[0].id,
          nextVersion,
          validated.decision,
          JSON.stringify({
            result: validated,
            aiExecution: aiResponse.aiExecution,
            generatedAt: validated.screenedAt,
            article: request.article,
          }),
          validated.confidence / 100,
        ],
      );
      await client.query(
        `UPDATE literature_packages SET status = 'SCREENING_REVIEW', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [row.package_id, input.principal.tenantId],
      );
      await client.query(
        `UPDATE literature_workflow_state
         SET workflow_state = 'SCREENING_REVIEW', state_version = state_version + 1,
             state_payload = state_payload || $3::jsonb,
             updated_by = $4, updated_at = now()
         WHERE package_id = $1 AND tenant_id = $2`,
        [
          row.package_id,
          input.principal.tenantId,
          JSON.stringify({
            screeningResultId: stored.rows[0].id,
            screeningResultVersion: nextVersion,
            screeningDecision: validated.decision,
            screeningCompletedAt: validated.screenedAt,
            screeningExecutionFailed: false,
            error: null,
            correlationId,
          }),
          input.principal.userId,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, package_id, actor_id, event_type, event_category,
           outcome, request_id, correlation_id, details
         ) VALUES ($1, $2, $3, 'SCREENING_EXECUTION_COMPLETED',
           'LITERATURE_SCREENING', 'success', $4, $5, $6::jsonb)`,
        [
          input.principal.tenantId,
          row.package_id,
          input.principal.userId,
          aiResponse.aiExecution.requestId,
          correlationId,
          JSON.stringify({
            screeningResultId: stored.rows[0].id,
            resultVersion: nextVersion,
            decision: validated.decision,
            confidence: validated.confidence,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Screening execution error.";
    await updateWorkflow({
      principal: input.principal,
      packageId: row.package_id,
      state: "SCREENING_REVIEW",
      payload: {
        screeningExecutionFailed: true,
        screeningFailedAt: new Date().toISOString(),
        qcRequired: true,
        error: message,
        correlationId,
      },
      eventType: "SCREENING_EXECUTION_FAILED",
      outcome: "failure",
    });
    throw error;
  }

  return mapQueueRow(await queueRow({ principal: input.principal, packageId: row.package_id }));
}

export async function saveScreeningReview(input: {
  principal: RequestPrincipal;
  review: SaveScreeningReviewInput;
}): Promise<ScreeningWorkflowMutation> {
  const review = input.review;
  if (!review.packageId?.trim() || !review.screeningResultId?.trim()) {
    throw new Error("packageId and screeningResultId are required.");
  }
  if (!review.comments?.trim() || review.comments.trim().length < 3) {
    throw new Error("A screening review rationale is required.");
  }
  if (!["pending", "approved", "excluded", "flagged"].includes(review.status)) {
    throw new Error("Invalid screening review status.");
  }
  const workflowState =
    review.status === "approved" || review.status === "excluded"
      ? "SCREENING_COMPLETE"
      : "SCREENING_REVIEW";
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const target = await client.query<{ id: string }>(
      `SELECT result.id
       FROM screening_results result
       JOIN literature_packages package ON package.id = result.package_id
       WHERE result.tenant_id = $1 AND package.id = $2 AND result.id = $3
       FOR UPDATE OF result, package`,
      [input.principal.tenantId, review.packageId, review.screeningResultId],
    );
    if (!target.rows[0]) throw new Error("Screening result was not found in the active tenant.");

    const existing = await client.query<{ review_version: number }>(
      `SELECT review_version FROM screening_reviews
       WHERE tenant_id = $1 AND package_id = $2 AND screening_result_id = $3
       FOR UPDATE`,
      [input.principal.tenantId, review.packageId, review.screeningResultId],
    );
    const currentVersion = existing.rows[0]?.review_version ?? 0;
    if (review.expectedVersion !== undefined && review.expectedVersion !== currentVersion) {
      throw new Error(
        `Screening review version conflict. Expected ${review.expectedVersion}, current version is ${currentVersion}.`,
      );
    }
    const saved = await client.query<{ review_version: number }>(
      `INSERT INTO screening_reviews (
         tenant_id, package_id, screening_result_id, review_status,
         final_decision, comments, reviewed_by, reviewed_at, review_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), 1)
       ON CONFLICT (tenant_id, package_id, screening_result_id)
       DO UPDATE SET
         review_status = EXCLUDED.review_status,
         final_decision = EXCLUDED.final_decision,
         comments = EXCLUDED.comments,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = now(),
         review_version = screening_reviews.review_version + 1,
         updated_at = now()
       RETURNING review_version`,
      [
        input.principal.tenantId,
        review.packageId,
        review.screeningResultId,
        review.status,
        review.finalDecision,
        review.comments.trim(),
        input.principal.userId,
      ],
    );
    await client.query(
      `UPDATE literature_packages SET status = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [review.packageId, input.principal.tenantId, workflowState],
    );
    await client.query(
      `UPDATE literature_workflow_state
       SET workflow_state = $3, state_version = state_version + 1,
           state_payload = state_payload || $4::jsonb,
           updated_by = $5, updated_at = now()
       WHERE package_id = $1 AND tenant_id = $2`,
      [
        review.packageId,
        input.principal.tenantId,
        workflowState,
        JSON.stringify({
          screeningReviewStatus: review.status,
          screeningFinalDecision: review.finalDecision,
          screeningReviewVersion: saved.rows[0].review_version,
          screeningReviewedAt: new Date().toISOString(),
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type,
         event_category, outcome, details
       ) VALUES ($1, $2, $3, 'SCREENING_REVIEW_SAVED',
         'LITERATURE_SCREENING', 'success', $4::jsonb)`,
      [
        input.principal.tenantId,
        review.packageId,
        input.principal.userId,
        JSON.stringify({
          screeningResultId: review.screeningResultId,
          reviewStatus: review.status,
          finalDecision: review.finalDecision,
          reviewVersion: saved.rows[0].review_version,
          workflowState,
          comments: review.comments.trim(),
        }),
      ],
    );
    await client.query("COMMIT");

    return {
      packageId: review.packageId,
      screeningResultId: review.screeningResultId,
      workflowState,
      reviewStatus: review.status,
      finalDecision: review.finalDecision,
      reviewVersion: saved.rows[0].review_version,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
