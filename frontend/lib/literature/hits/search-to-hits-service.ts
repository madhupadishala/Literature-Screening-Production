import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { hitsAgent } from "@/lib/ai/hits-agent";
import type { HitsAIResult } from "@/lib/ai/hits-result-parser";
import { getPostgresPool } from "@/lib/database/postgres";
import { createEvidencePackagesFromSearch } from "@/lib/literature/adhoc-search/evidence-package-service";
import { runAsyncBatch } from "@/lib/performance/async-batch-runner";
import { getRuntimePerformanceSettings } from "@/lib/performance/runtime-performance-settings";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import type {
  SearchToHitsExecution,
  SearchToHitsPackageResult,
} from "./search-to-hits-types";

interface PackageInputRow {
  package_id: string;
  package_key: string;
  article_identity: Record<string, unknown>;
  product_context: Record<string, unknown>;
  result_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  abstract_text: string | null;
  language: string | null;
  publication_type: string | null;
  match_metadata: Record<string, unknown>;
}

interface CreatedPackage {
  packageId: string;
  packageKey: string;
  title: string;
  mergedSources: string[];
  duplicateMerged: boolean;
  duplicateSignals: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function nestedRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const nested = value[key];
  return isRecord(nested) ? nested : {};
}

function resolveProductName(row: PackageInputRow): string | undefined {
  const contexts = [
    nestedRecord(row.product_context, "resolvedProduct"),
    nestedRecord(row.match_metadata, "resolvedProduct"),
    row.product_context,
    row.match_metadata,
  ];

  for (const context of contexts) {
    const name =
      optionalString(context.preferredName) ??
      optionalString(context.productName) ??
      optionalString(context.product_name) ??
      optionalString(context.inn);

    if (name) return name;
  }

  return undefined;
}

function resolveCountry(row: PackageInputRow): string | undefined {
  const contexts = [row.match_metadata, row.product_context];

  for (const context of contexts) {
    const country =
      optionalString(context.country) ??
      optionalString(context.countryOfInterest) ??
      optionalString(context.country_of_interest) ??
      optionalString(context.authorCountry);

    if (country) return country;
  }

  return undefined;
}

function hashPayload(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function rejectPreviouslyPromotedResults(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<void> {
  const existing = await getPostgresPool().query<{
    id: string;
    evidence_package_id: string;
  }>(
    `
      SELECT id, evidence_package_id
      FROM ad_hoc_literature_results
      WHERE tenant_id = $1
        AND id = ANY($2::uuid[])
        AND evidence_package_id IS NOT NULL
    `,
    [input.principal.tenantId, input.resultIds],
  );

  if (existing.rows.length > 0) {
    throw new Error(
      "One or more selected search results have already been promoted to Hits.",
    );
  }
}

async function loadPackageInput(input: {
  principal: RequestPrincipal;
  packageId: string;
}): Promise<PackageInputRow> {
  const result = await getPostgresPool().query<PackageInputRow>(
    `
      SELECT
        package.id AS package_id,
        package.package_key,
        package.article_identity,
        package.product_context,
        search_result.id AS result_id,
        search_result.pmid,
        search_result.doi,
        search_result.title,
        search_result.abstract_text,
        search_result.language,
        search_result.publication_type,
        search_result.match_metadata
      FROM literature_packages package
      JOIN ad_hoc_literature_results search_result
        ON search_result.evidence_package_id = package.id
       AND search_result.tenant_id = package.tenant_id
      WHERE package.tenant_id = $1
        AND package.id = $2
      ORDER BY
        CASE WHEN search_result.pmid IS NOT NULL THEN 0 ELSE 1 END,
        search_result.created_at
      LIMIT 1
    `,
    [input.principal.tenantId, input.packageId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Evidence package source article was not found.");
  }

  return row;
}

async function markHitsRunning(input: {
  principal: RequestPrincipal;
  packageId: string;
  correlationId: string;
}): Promise<void> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE literature_packages
        SET status = 'HITS_RUNNING', updated_at = now()
        WHERE id = $1 AND tenant_id = $2
      `,
      [input.packageId, input.principal.tenantId],
    );
    await client.query(
      `
        UPDATE literature_workflow_state
        SET
          workflow_state = 'HITS_RUNNING',
          state_version = state_version + 1,
          state_payload = state_payload || $3::jsonb,
          updated_by = $4,
          updated_at = now()
        WHERE package_id = $1 AND tenant_id = $2
      `,
      [
        input.packageId,
        input.principal.tenantId,
        JSON.stringify({
          hitsStartedAt: new Date().toISOString(),
          correlationId: input.correlationId,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, package_id, actor_id, event_type,
          event_category, outcome, correlation_id, details
        )
        VALUES ($1, $2, $3, 'HITS_EXECUTION_STARTED',
          'LITERATURE_HITS', 'started', $4, $5::jsonb)
      `,
      [
        input.principal.tenantId,
        input.packageId,
        input.principal.userId,
        input.correlationId,
        JSON.stringify({ workflowState: "HITS_RUNNING" }),
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

async function persistHitsSuccess(input: {
  principal: RequestPrincipal;
  row: PackageInputRow;
  correlationId: string;
  response: Awaited<ReturnType<typeof hitsAgent.evaluate>>;
}): Promise<number> {
  const client = await getPostgresPool().connect();
  const payload = {
    result: input.response.result,
    aiExecution: input.response.aiExecution,
    generatedAt: input.response.generatedAt,
    article: {
      resultId: input.row.result_id,
      pmid: input.row.pmid,
      doi: input.row.doi,
      title: input.row.title,
      language: input.row.language,
      publicationType: input.row.publication_type,
    },
    knowledgeEvidence: input.response.ragContext.chunks,
  };

  try {
    await client.query("BEGIN");
    const execution = await client.query<{ id: string }>(
      `
        INSERT INTO ai_executions (
          tenant_id, package_id, execution_type, provider, model,
          request_id, input_sha256, status, latency_ms, token_usage,
          created_at, completed_at
        )
        VALUES (
          $1, $2, 'hits', $3, $4, $5, $6, 'succeeded', $7,
          $8::jsonb, now(), now()
        )
        RETURNING id
      `,
      [
        input.principal.tenantId,
        input.row.package_id,
        input.response.aiExecution.provider,
        input.response.aiExecution.model,
        input.response.aiExecution.requestId,
        hashPayload({
          articleId: input.row.package_key,
          title: input.row.title,
          abstract: input.row.abstract_text,
        }),
        input.response.aiExecution.latencyMs,
        JSON.stringify({
          promptTokens: input.response.aiExecution.promptTokens,
          completionTokens: input.response.aiExecution.completionTokens,
          totalTokens: input.response.aiExecution.totalTokens,
          attempts: input.response.aiExecution.attempts,
        }),
      ],
    );
    const version = await client.query<{ next_version: number }>(
      `
        SELECT COALESCE(MAX(result_version), 0) + 1 AS next_version
        FROM hits_results
        WHERE package_id = $1
      `,
      [input.row.package_id],
    );
    const nextVersion = Number(version.rows[0].next_version);
    await client.query(
      `
        INSERT INTO hits_results (
          tenant_id, package_id, execution_id, result_version,
          result_payload, confidence
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [
        input.principal.tenantId,
        input.row.package_id,
        execution.rows[0].id,
        nextVersion,
        JSON.stringify(payload),
        input.response.result.confidence,
      ],
    );
    await client.query(
      `
        UPDATE literature_packages
        SET status = 'HITS_REVIEW', updated_at = now()
        WHERE id = $1 AND tenant_id = $2
      `,
      [input.row.package_id, input.principal.tenantId],
    );
    await client.query(
      `
        UPDATE literature_workflow_state
        SET
          workflow_state = 'HITS_REVIEW',
          state_version = state_version + 1,
          state_payload = state_payload || $3::jsonb,
          updated_by = $4,
          updated_at = now()
        WHERE package_id = $1 AND tenant_id = $2
      `,
      [
        input.row.package_id,
        input.principal.tenantId,
        JSON.stringify({
          hitsCompletedAt: new Date().toISOString(),
          hitsResultVersion: nextVersion,
          classification: input.response.result.classification,
          qcRequired: input.response.result.qcRequired,
          correlationId: input.correlationId,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, package_id, actor_id, event_type,
          event_category, outcome, request_id, correlation_id, details
        )
        VALUES ($1, $2, $3, 'HITS_EXECUTION_COMPLETED',
          'LITERATURE_HITS', 'success', $4, $5, $6::jsonb)
      `,
      [
        input.principal.tenantId,
        input.row.package_id,
        input.principal.userId,
        input.response.aiExecution.requestId,
        input.correlationId,
        JSON.stringify({
          workflowState: "HITS_REVIEW",
          resultVersion: nextVersion,
          classification: input.response.result.classification,
          confidence: input.response.result.confidence,
          qcRequired: input.response.result.qcRequired,
          recommendedNextStep: input.response.result.recommendedNextStep,
        }),
      ],
    );
    await client.query("COMMIT");
    return nextVersion;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function persistHitsFailure(input: {
  principal: RequestPrincipal;
  packageId: string;
  correlationId: string;
  error: string;
}): Promise<void> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO ai_executions (
          tenant_id, package_id, execution_type, provider, model,
          request_id, status, error_code, error_message,
          created_at, completed_at
        )
        VALUES (
          $1, $2, 'hits', 'unavailable', 'unavailable', $3,
          'failed', 'HITS_EXECUTION_FAILED', $4, now(), now()
        )
      `,
      [
        input.principal.tenantId,
        input.packageId,
        input.correlationId,
        input.error,
      ],
    );
    await client.query(
      `
        UPDATE literature_packages
        SET status = 'HITS_REVIEW', updated_at = now()
        WHERE id = $1 AND tenant_id = $2
      `,
      [input.packageId, input.principal.tenantId],
    );
    await client.query(
      `
        UPDATE literature_workflow_state
        SET
          workflow_state = 'HITS_REVIEW',
          state_version = state_version + 1,
          state_payload = state_payload || $3::jsonb,
          updated_by = $4,
          updated_at = now()
        WHERE package_id = $1 AND tenant_id = $2
      `,
      [
        input.packageId,
        input.principal.tenantId,
        JSON.stringify({
          hitsFailedAt: new Date().toISOString(),
          hitsExecutionFailed: true,
          qcRequired: true,
          failureReason: input.error,
          correlationId: input.correlationId,
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, package_id, actor_id, event_type,
          event_category, outcome, correlation_id, details
        )
        VALUES ($1, $2, $3, 'HITS_EXECUTION_FAILED',
          'LITERATURE_HITS', 'failure', $4, $5::jsonb)
      `,
      [
        input.principal.tenantId,
        input.packageId,
        input.principal.userId,
        input.correlationId,
        JSON.stringify({
          workflowState: "HITS_REVIEW",
          qcRequired: true,
          error: input.error,
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

async function processPackage(input: {
  principal: RequestPrincipal;
  createdPackage: CreatedPackage;
}): Promise<SearchToHitsPackageResult> {
  const correlationId = `search-hits-${randomUUID()}`;
  const row = await loadPackageInput({
    principal: input.principal,
    packageId: input.createdPackage.packageId,
  });

  await markHitsRunning({
    principal: input.principal,
    packageId: row.package_id,
    correlationId,
  });

  try {
    const response = await hitsAgent.evaluate({
      tenantId: input.principal.tenantId,
      articleId: row.package_key,
      articleTitle: row.title,
      abstractText: row.abstract_text ?? undefined,
      productName: resolveProductName(row),
      country: resolveCountry(row),
      processArea: "literature_hits",
      correlationId,
    });
    const hitsResultVersion = await persistHitsSuccess({
      principal: input.principal,
      row,
      correlationId,
      response,
    });

    return {
      ...input.createdPackage,
      status:
        response.result.classification === "needs_manual_review" ||
        response.result.qcRequired
          ? "manual_review"
          : "completed",
      workflowState: "HITS_REVIEW",
      hitsResult: response.result,
      hitsResultVersion,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Hits execution error.";

    await persistHitsFailure({
      principal: input.principal,
      packageId: row.package_id,
      correlationId,
      error: message,
    });

    return {
      ...input.createdPackage,
      status: "failed",
      workflowState: "HITS_REVIEW",
      error: message,
    };
  }
}

export async function executeSearchToHits(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<SearchToHitsExecution> {
  const startedAt = Date.now();
  const resultIds = [...new Set(input.resultIds.map((id) => id.trim()).filter(Boolean))];

  if (resultIds.length === 0) {
    throw new Error("Select at least one literature result.");
  }
  if (resultIds.length > 100) {
    throw new Error("A maximum of 100 search results can be promoted in one action.");
  }

  await rejectPreviouslyPromotedResults({
    principal: input.principal,
    resultIds,
  });

  const createdPackages = await createEvidencePackagesFromSearch({
    principal: input.principal,
    resultIds,
  });
  const settings = getRuntimePerformanceSettings();
  const batch = await runAsyncBatch({
    items: createdPackages,
    concurrency: Math.max(1, Math.min(settings.articleConcurrency, 4)),
    worker: (createdPackage) =>
      processPackage({ principal: input.principal, createdPackage }),
  });
  const packages: SearchToHitsPackageResult[] = batch.results.map((item) =>
    item.status === "fulfilled"
      ? item.value
      : {
          ...item.input,
          status: "failed",
          workflowState: "HITS_REVIEW",
          error: item.error,
        },
  );
  const hitsCompletedCount = packages.filter(
    (item) => item.status === "completed",
  ).length;
  const manualReviewCount = packages.filter(
    (item) => item.status === "manual_review",
  ).length;
  const failedCount = packages.filter((item) => item.status === "failed").length;
  const duplicateMergedCount = packages.filter(
    (item) => item.duplicateMerged,
  ).length;

  return {
    status:
      failedCount === packages.length
        ? "failed"
        : failedCount > 0
          ? "partial"
          : "completed",
    requestedResultCount: resultIds.length,
    createdCount: createdPackages.length,
    hitsCompletedCount,
    manualReviewCount,
    failedCount,
    duplicateMergedCount,
    durationMs: Date.now() - startedAt,
    packages,
  };
}

export type { HitsAIResult };
