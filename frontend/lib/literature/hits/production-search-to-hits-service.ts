import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
import { hitsAgent } from "@/lib/ai/hits-agent";
import { runAsyncBatch } from "@/lib/performance/async-batch-runner";
import { getRuntimePerformanceSettings } from "@/lib/performance/runtime-performance-settings";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

type SearchResultRow = {
  id: string;
  search_id: string;
  source_key: string;
  source_record_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: unknown;
  journal: string | null;
  publication_date: string | null;
  language: string | null;
  publication_type: string | null;
  abstract_text: string | null;
  landing_url: string | null;
  full_text_status: string;
  match_metadata: Record<string, unknown>;
  dedupe_key: string;
  created_at: string;
};

type CreatedPackage = {
  packageId: string;
  packageKey: string;
  title: string;
  mergedSources: string[];
  duplicateMerged: boolean;
  duplicateSignals: string[];
};

type PackageInputRow = {
  package_id: string;
  package_key: string;
  product_context: Record<string, unknown>;
  result_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  abstract_text: string | null;
  language: string | null;
  publication_type: string | null;
  match_metadata: Record<string, unknown>;
};

function safeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

function packageKeyFor(row: SearchResultRow): string {
  const identity = row.pmid || row.doi || row.source_record_id || randomUUID().slice(0, 12);
  return safeSegment(`ADHOC_${row.source_key}_${identity}_${randomUUID().slice(0, 8)}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function richness(row: SearchResultRow): number {
  return (
    (row.abstract_text?.trim().length || 0) * 10 +
    (row.doi ? 100 : 0) +
    (row.publication_type ? 20 : 0) +
    (row.journal ? 10 : 0)
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveProductName(row: PackageInputRow): string | undefined {
  const contexts = [
    record(row.product_context.resolvedProduct),
    record(row.match_metadata.resolvedProduct),
    row.product_context,
    row.match_metadata,
  ];
  for (const context of contexts) {
    const candidate =
      optionalString(context.preferredName) ||
      optionalString(context.productName) ||
      optionalString(context.product_name) ||
      optionalString(context.inn);
    if (candidate) return candidate;
  }
  return undefined;
}

function resolveCountry(row: PackageInputRow): string | undefined {
  for (const context of [row.match_metadata, row.product_context]) {
    const candidate =
      optionalString(context.country) ||
      optionalString(context.countryOfInterest) ||
      optionalString(context.country_of_interest) ||
      optionalString(context.authorCountry);
    if (candidate) return candidate;
  }
  return undefined;
}

async function rejectPreviouslyPromotedResults(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<void> {
  const existing = await getPostgresPool().query(
    `SELECT id FROM ad_hoc_literature_results
     WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND evidence_package_id IS NOT NULL`,
    [input.principal.tenantId, input.resultIds],
  );
  if (existing.rows.length > 0) {
    throw new Error("One or more selected search results have already been promoted to Hits.");
  }
}

async function createDatabaseEvidencePackages(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<CreatedPackage[]> {
  const pool = getPostgresPool();
  const selected = await pool.query<SearchResultRow>(
    `SELECT * FROM ad_hoc_literature_results
     WHERE tenant_id = $1 AND id = ANY($2::uuid[])
     ORDER BY created_at`,
    [input.principal.tenantId, input.resultIds],
  );
  if (selected.rows.length !== input.resultIds.length) {
    throw new Error("One or more selected results were not found in the active tenant.");
  }

  const grouped = new Map<string, SearchResultRow[]>();
  for (const row of selected.rows) {
    const values = grouped.get(row.dedupe_key) || [];
    values.push(row);
    grouped.set(row.dedupe_key, values);
  }

  const active = await resolveActiveConfigurations(input.principal.tenantId);
  const snapshotPayload = configurationSnapshotPayload(active);
  const created: CreatedPackage[] = [];

  for (const groupRows of grouped.values()) {
    const rows = [...groupRows].sort((a, b) => richness(b) - richness(a));
    const primary = rows[0];
    const selectedRowIds = rows.map((row) => row.id);

    const prior = await pool.query<{ id: string; package_key: string; match_signal: string }>(
      `SELECT package.id, package.package_key,
         CASE
           WHEN $3::text IS NOT NULL AND prior.pmid = $3 THEN 'EXACT_PMID'
           WHEN $4::text IS NOT NULL AND lower(prior.doi) = lower($4) THEN 'EXACT_DOI'
           ELSE 'DEDUPE_KEY'
         END AS match_signal
       FROM ad_hoc_literature_results prior
       JOIN literature_packages package
         ON package.id = prior.evidence_package_id AND package.tenant_id = prior.tenant_id
       WHERE prior.tenant_id = $1
         AND prior.evidence_package_id IS NOT NULL
         AND NOT (prior.id = ANY($2::uuid[]))
         AND (($3::text IS NOT NULL AND prior.pmid = $3)
           OR ($4::text IS NOT NULL AND lower(prior.doi) = lower($4))
           OR prior.dedupe_key = $5)
       ORDER BY CASE
         WHEN $3::text IS NOT NULL AND prior.pmid = $3 THEN 0
         WHEN $4::text IS NOT NULL AND lower(prior.doi) = lower($4) THEN 1
         ELSE 2 END, prior.created_at
       LIMIT 1`,
      [
        input.principal.tenantId,
        selectedRowIds,
        primary.pmid || null,
        primary.doi || null,
        primary.dedupe_key,
      ],
    );

    if (prior.rows[0]) {
      const canonical = prior.rows[0];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE ad_hoc_literature_results
           SET selected = true, evidence_package_id = $3
           WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [input.principal.tenantId, selectedRowIds, canonical.id],
        );
        for (const row of rows) {
          await client.query(
            `INSERT INTO literature_package_sources (
               tenant_id, package_id, search_result_id, source_key,
               source_record_id, pmid, doi, landing_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (tenant_id, package_id, source_key, source_record_id)
             DO UPDATE SET search_result_id=EXCLUDED.search_result_id,
               pmid=COALESCE(EXCLUDED.pmid,literature_package_sources.pmid),
               doi=COALESCE(EXCLUDED.doi,literature_package_sources.doi),
               landing_url=COALESCE(EXCLUDED.landing_url,literature_package_sources.landing_url)`,
            [input.principal.tenantId, canonical.id, row.id, row.source_key, row.source_record_id,
              row.pmid, row.doi, row.landing_url],
          );
          await client.query(
            `INSERT INTO duplicate_assessments (
               tenant_id, candidate_result_id, canonical_package_id,
               classification, confidence, match_signals)
             VALUES ($1,$2,$3,'duplicate',1,$4::jsonb)
             ON CONFLICT (tenant_id, candidate_result_id)
             DO UPDATE SET canonical_package_id=EXCLUDED.canonical_package_id,
               classification='duplicate', confidence=1,
               match_signals=EXCLUDED.match_signals, assessed_at=now()`,
            [input.principal.tenantId, row.id, canonical.id, JSON.stringify([canonical.match_signal])],
          );
        }
        await client.query(
          `UPDATE ad_hoc_literature_searches SET selected_count=(
             SELECT count(*) FROM ad_hoc_literature_results WHERE search_id=$1 AND selected=true)
           WHERE id=$1`,
          [primary.search_id],
        );
        await client.query(
          `INSERT INTO audit_events (
             tenant_id, package_id, actor_id, event_type, event_category, outcome, details)
           VALUES ($1,$2,$3,'DUPLICATE_SOURCES_MERGED','LITERATURE_DUPLICATES','success',$4::jsonb)`,
          [input.principal.tenantId, canonical.id, input.principal.userId, JSON.stringify({
            searchId: primary.search_id,
            sourceResultIds: selectedRowIds,
            sources: rows.map((row) => row.source_key),
            matchSignals: [canonical.match_signal],
            canonicalPackageKey: canonical.package_key,
          })],
        );
        await client.query("COMMIT");
        created.push({
          packageId: canonical.id,
          packageKey: canonical.package_key,
          title: primary.title,
          mergedSources: [...new Set(rows.map((row) => row.source_key))],
          duplicateMerged: true,
          duplicateSignals: [canonical.match_signal],
        });
        continue;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    const packageKey = packageKeyFor(primary);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const packageResult = await client.query<{ id: string }>(
        `INSERT INTO literature_packages (
           tenant_id, package_key, source_type, external_reference,
           article_identity, product_context, status, created_by)
         VALUES ($1,$2,'AD_HOC_GLOBAL_SEARCH',$3,$4::jsonb,$5::jsonb,'NEW',$6)
         RETURNING id`,
        [
          input.principal.tenantId,
          packageKey,
          primary.pmid || primary.doi || primary.source_record_id,
          JSON.stringify({
            title: primary.title,
            pmid: primary.pmid,
            doi: primary.doi,
            abstract: primary.abstract_text,
            journal: primary.journal,
            publicationDate: primary.publication_date,
            language: primary.language,
            publicationType: primary.publication_type,
            sourceRecords: rows.map((row) => ({
              sourceKey: row.source_key,
              sourceRecordId: row.source_record_id,
              landingUrl: row.landing_url,
            })),
            dedupeKey: primary.dedupe_key,
          }),
          JSON.stringify(primary.match_metadata || {}),
          input.principal.userId,
        ],
      );
      const packageId = packageResult.rows[0].id;

      await client.query(
        `INSERT INTO hits_results (tenant_id, package_id, result_version, result_payload, confidence)
         VALUES ($1,$2,1,$3::jsonb,$4)`,
        [
          input.principal.tenantId,
          packageId,
          JSON.stringify({
            source: "AD_HOC_GLOBAL_SEARCH",
            status: "PENDING_HITS_AI",
            title: primary.title,
            pmid: primary.pmid,
            doi: primary.doi,
            sourceRecords: rows.map((row) => ({
              sourceKey: row.source_key,
              sourceRecordId: row.source_record_id,
              landingUrl: row.landing_url,
            })),
          }),
          null,
        ],
      );

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        await client.query(
          `INSERT INTO literature_package_sources (
             tenant_id, package_id, search_result_id, source_key,
             source_record_id, pmid, doi, landing_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (tenant_id, package_id, source_key, source_record_id) DO NOTHING`,
          [input.principal.tenantId, packageId, row.id, row.source_key, row.source_record_id,
            row.pmid, row.doi, row.landing_url],
        );
        await client.query(
          `INSERT INTO duplicate_assessments (
             tenant_id, candidate_result_id, canonical_package_id,
             classification, confidence, match_signals)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)
           ON CONFLICT (tenant_id, candidate_result_id) DO UPDATE SET
             canonical_package_id=EXCLUDED.canonical_package_id,
             classification=EXCLUDED.classification,
             confidence=EXCLUDED.confidence,
             match_signals=EXCLUDED.match_signals,
             assessed_at=now()`,
          [
            input.principal.tenantId,
            row.id,
            packageId,
            index === 0 ? "unique" : "duplicate",
            index === 0 ? 0 : 1,
            JSON.stringify(index === 0 ? [] : ["INTRA_SEARCH_DEDUPE_KEY"]),
          ],
        );
      }

      await client.query(
        `INSERT INTO literature_workflow_state (
           package_id, tenant_id, workflow_state, state_payload, updated_by)
         VALUES ($1,$2,'NEW',$3::jsonb,$4)`,
        [packageId, input.principal.tenantId, JSON.stringify({
          origin: "AD_HOC_GLOBAL_SEARCH",
          searchId: primary.search_id,
          sourceResultIds: rows.map((row) => row.id),
        }), input.principal.userId],
      );

      await client.query(
        `INSERT INTO package_configuration_snapshots (
           package_id, tenant_id, search_execution_id, product_master_version_id,
           literature_calendar_version_id, client_guideline_version_ids,
           outcome_template_version_id, snapshot_payload)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb)`,
        [
          packageId,
          input.principal.tenantId,
          primary.search_id,
          active.productMaster?.id || null,
          active.literatureCalendar?.id || null,
          JSON.stringify(active.clientGuidelines.map((item) => item.id)),
          active.outcomeTemplate?.id || null,
          JSON.stringify(snapshotPayload),
        ],
      );

      await client.query(
        `UPDATE ad_hoc_literature_results
         SET selected=true, evidence_package_id=$2
         WHERE tenant_id=$1 AND id=ANY($3::uuid[])`,
        [input.principal.tenantId, packageId, selectedRowIds],
      );
      await client.query(
        `UPDATE ad_hoc_literature_searches SET selected_count=(
           SELECT count(*) FROM ad_hoc_literature_results WHERE search_id=$1 AND selected=true)
         WHERE id=$1`,
        [primary.search_id],
      );

      const evidencePayload = {
        package_id: packageKey,
        database_package_id: packageId,
        source_type: "AD_HOC_GLOBAL_SEARCH",
        search_id: primary.search_id,
        title: primary.title,
        pmid: primary.pmid,
        doi: primary.doi,
        authors: primary.authors,
        journal: primary.journal,
        publication_date: primary.publication_date,
        language: primary.language,
        publication_type: primary.publication_type,
        abstract: primary.abstract_text,
        full_text_status: primary.full_text_status,
        source_records: rows.map((row) => ({
          source_key: row.source_key,
          source_record_id: row.source_record_id,
          landing_url: row.landing_url,
        })),
        configuration_snapshot: snapshotPayload,
        created_at: new Date().toISOString(),
        created_by: input.principal.email,
      };
      const serializedEvidence = JSON.stringify(evidencePayload);
      await client.query(
        `INSERT INTO evidence_artifacts (
           tenant_id, package_id, artifact_type, storage_backend, storage_key,
           media_type, sha256, size_bytes, metadata)
         VALUES ($1,$2,'EVIDENCE_PACKAGE_SNAPSHOT','postgresql',$3,
           'application/json',$4,$5,$6::jsonb)`,
        [
          input.principal.tenantId,
          packageId,
          `evidence-package/${input.principal.tenantKey}/${packageKey}/initial-snapshot.json`,
          sha256(serializedEvidence),
          Buffer.byteLength(serializedEvidence, "utf8"),
          JSON.stringify({ payload: evidencePayload }),
        ],
      );

      await client.query(
        `INSERT INTO audit_events (
           tenant_id, package_id, actor_id, event_type, event_category, outcome, details)
         VALUES ($1,$2,$3,'EVIDENCE_PACKAGE_CREATED','LITERATURE_SEARCH','success',$4::jsonb)`,
        [input.principal.tenantId, packageId, input.principal.userId, JSON.stringify({
          packageKey,
          searchId: primary.search_id,
          sourceResultIds: selectedRowIds,
          mergedSources: rows.map((row) => row.source_key),
          evidenceStorageBackend: "postgresql",
          configurationSnapshot: snapshotPayload,
        })],
      );
      await client.query("COMMIT");

      created.push({
        packageId,
        packageKey,
        title: primary.title,
        mergedSources: [...new Set(rows.map((row) => row.source_key))],
        duplicateMerged: rows.length > 1,
        duplicateSignals: rows.length > 1 ? ["INTRA_SEARCH_DEDUPE_KEY"] : [],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return created;
}

async function loadPackageInput(input: {
  principal: RequestPrincipal;
  packageId: string;
}): Promise<PackageInputRow> {
  const result = await getPostgresPool().query<PackageInputRow>(
    `SELECT package.id AS package_id, package.package_key, package.product_context,
       search_result.id AS result_id, search_result.pmid, search_result.doi,
       search_result.title, search_result.abstract_text, search_result.language,
       search_result.publication_type, search_result.match_metadata
     FROM literature_packages package
     JOIN ad_hoc_literature_results search_result
       ON search_result.evidence_package_id=package.id
      AND search_result.tenant_id=package.tenant_id
     WHERE package.tenant_id=$1 AND package.id=$2
     ORDER BY (search_result.abstract_text IS NOT NULL) DESC,
       length(COALESCE(search_result.abstract_text,'')) DESC,
       search_result.created_at
     LIMIT 1`,
    [input.principal.tenantId, input.packageId],
  );
  if (!result.rows[0]) throw new Error("Evidence package source article was not found.");
  return result.rows[0];
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
      `UPDATE literature_packages SET status='HITS_RUNNING', updated_at=now()
       WHERE id=$1 AND tenant_id=$2`,
      [input.packageId, input.principal.tenantId],
    );
    await client.query(
      `UPDATE literature_workflow_state SET workflow_state='HITS_RUNNING',
         state_version=state_version+1,
         state_payload=state_payload || $3::jsonb,
         updated_by=$4, updated_at=now()
       WHERE package_id=$1 AND tenant_id=$2`,
      [input.packageId, input.principal.tenantId, JSON.stringify({
        hitsStartedAt: new Date().toISOString(), correlationId: input.correlationId,
      }), input.principal.userId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, correlation_id, details)
       VALUES ($1,$2,$3,'HITS_EXECUTION_STARTED','LITERATURE_HITS','started',$4,$5::jsonb)`,
      [input.principal.tenantId, input.packageId, input.principal.userId,
        input.correlationId, JSON.stringify({ workflowState: "HITS_RUNNING" })],
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
  try {
    await client.query("BEGIN");
    const execution = await client.query<{ id: string }>(
      `INSERT INTO ai_executions (
         tenant_id, package_id, execution_type, provider, model, request_id,
         input_sha256, status, latency_ms, token_usage, created_at, completed_at)
       VALUES ($1,$2,'hits',$3,$4,$5,$6,'succeeded',$7,$8::jsonb,now(),now()) RETURNING id`,
      [
        input.principal.tenantId,
        input.row.package_id,
        input.response.aiExecution.provider,
        input.response.aiExecution.model,
        input.response.aiExecution.requestId,
        sha256(JSON.stringify({
          articleId: input.row.package_key,
          title: input.row.title,
          abstract: input.row.abstract_text,
        })),
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
      `SELECT COALESCE(MAX(result_version),0)+1 AS next_version FROM hits_results WHERE package_id=$1`,
      [input.row.package_id],
    );
    const nextVersion = Number(version.rows[0].next_version);
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
    await client.query(
      `INSERT INTO hits_results (
         tenant_id, package_id, execution_id, result_version, result_payload, confidence)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [input.principal.tenantId, input.row.package_id, execution.rows[0].id,
        nextVersion, JSON.stringify(payload), input.response.result.confidence],
    );
    await client.query(
      `UPDATE literature_packages SET status='HITS_REVIEW', updated_at=now()
       WHERE id=$1 AND tenant_id=$2`,
      [input.row.package_id, input.principal.tenantId],
    );
    await client.query(
      `UPDATE literature_workflow_state SET workflow_state='HITS_REVIEW',
         state_version=state_version+1,
         state_payload=state_payload || $3::jsonb,
         updated_by=$4, updated_at=now()
       WHERE package_id=$1 AND tenant_id=$2`,
      [input.row.package_id, input.principal.tenantId, JSON.stringify({
        hitsCompletedAt: new Date().toISOString(),
        hitsResultVersion: nextVersion,
        classification: input.response.result.classification,
        qcRequired: input.response.result.qcRequired,
        correlationId: input.correlationId,
      }), input.principal.userId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome,
         request_id, correlation_id, details)
       VALUES ($1,$2,$3,'HITS_EXECUTION_COMPLETED','LITERATURE_HITS','success',$4,$5,$6::jsonb)`,
      [input.principal.tenantId, input.row.package_id, input.principal.userId,
        input.response.aiExecution.requestId, input.correlationId, JSON.stringify({
          workflowState: "HITS_REVIEW",
          resultVersion: nextVersion,
          classification: input.response.result.classification,
          confidence: input.response.result.confidence,
          qcRequired: input.response.result.qcRequired,
          recommendedNextStep: input.response.result.recommendedNextStep,
        })],
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
  row: PackageInputRow;
  correlationId: string;
  error: string;
}): Promise<void> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ai_executions (
         tenant_id, package_id, execution_type, provider, model, request_id,
         status, error_code, error_message, created_at, completed_at)
       VALUES ($1,$2,'hits','unavailable','unavailable',$3,'failed','HITS_EXECUTION_FAILED',$4,now(),now())`,
      [input.principal.tenantId, input.row.package_id, input.correlationId, input.error],
    );
    const version = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(result_version),0)+1 AS next_version FROM hits_results WHERE package_id=$1`,
      [input.row.package_id],
    );
    await client.query(
      `INSERT INTO hits_results (tenant_id, package_id, result_version, result_payload, confidence)
       VALUES ($1,$2,$3,$4::jsonb,NULL)`,
      [input.principal.tenantId, input.row.package_id, Number(version.rows[0].next_version), JSON.stringify({
        status: "HITS_EXECUTION_FAILED", error: input.error, qcRequired: true,
      })],
    );
    await client.query(
      `UPDATE literature_packages SET status='HITS_REVIEW', updated_at=now()
       WHERE id=$1 AND tenant_id=$2`,
      [input.row.package_id, input.principal.tenantId],
    );
    await client.query(
      `UPDATE literature_workflow_state SET workflow_state='HITS_REVIEW',
         state_version=state_version+1,
         state_payload=state_payload || $3::jsonb,
         updated_by=$4, updated_at=now()
       WHERE package_id=$1 AND tenant_id=$2`,
      [input.row.package_id, input.principal.tenantId, JSON.stringify({
        hitsFailedAt: new Date().toISOString(), hitsExecutionFailed: true,
        qcRequired: true, failureReason: input.error, correlationId: input.correlationId,
      }), input.principal.userId],
    );
    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, actor_id, event_type, event_category, outcome, correlation_id, details)
       VALUES ($1,$2,$3,'HITS_EXECUTION_FAILED','LITERATURE_HITS','failure',$4,$5::jsonb)`,
      [input.principal.tenantId, input.row.package_id, input.principal.userId,
        input.correlationId, JSON.stringify({ error: input.error, qcRequired: true })],
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
}) {
  const correlationId = `search-hits-${randomUUID()}`;
  const row = await loadPackageInput({ principal: input.principal, packageId: input.createdPackage.packageId });
  await markHitsRunning({ principal: input.principal, packageId: row.package_id, correlationId });
  try {
    const response = await hitsAgent.evaluate({
      tenantId: input.principal.tenantId,
      articleId: row.package_key,
      articleTitle: row.title,
      abstractText: row.abstract_text || undefined,
      productName: resolveProductName(row),
      country: resolveCountry(row),
      processArea: "literature_hits",
      correlationId,
    });
    const hitsResultVersion = await persistHitsSuccess({
      principal: input.principal, row, correlationId, response,
    });
    return {
      ...input.createdPackage,
      status:
        response.result.classification === "needs_manual_review" || response.result.qcRequired
          ? "manual_review"
          : "completed",
      workflowState: "HITS_REVIEW",
      hitsResult: response.result,
      hitsResultVersion,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Hits execution error.";
    await persistHitsFailure({ principal: input.principal, row, correlationId, error: message });
    return { ...input.createdPackage, status: "failed", workflowState: "HITS_REVIEW", error: message };
  }
}

export async function executeProductionSearchToHits(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}) {
  const startedAt = Date.now();
  const resultIds = [...new Set(input.resultIds.map((id) => id.trim()).filter(Boolean))];
  if (resultIds.length === 0) throw new Error("Select at least one literature result.");
  if (resultIds.length > 100) throw new Error("A maximum of 100 search results can be promoted in one action.");

  await rejectPreviouslyPromotedResults({ principal: input.principal, resultIds });
  const createdPackages = await createDatabaseEvidencePackages({ principal: input.principal, resultIds });
  const settings = getRuntimePerformanceSettings();
  const batch = await runAsyncBatch({
    items: createdPackages,
    concurrency: Math.max(1, Math.min(settings.articleConcurrency, 4)),
    worker: (createdPackage) => processPackage({ principal: input.principal, createdPackage }),
  });
  const packages = batch.results.map((item) =>
    item.status === "fulfilled"
      ? item.value
      : { ...item.input, status: "failed", workflowState: "HITS_REVIEW", error: item.error },
  );
  const hitsCompletedCount = packages.filter((item) => item.status === "completed").length;
  const manualReviewCount = packages.filter((item) => item.status === "manual_review").length;
  const failedCount = packages.filter((item) => item.status === "failed").length;
  const duplicateMergedCount = packages.filter((item) => item.duplicateMerged).length;

  return {
    status:
      failedCount === packages.length ? "failed" : failedCount > 0 ? "partial" : "completed",
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


export async function retryProductionHits(input: {
  principal: RequestPrincipal;
  packageId: string;
}) {
  const packageId = input.packageId?.trim();
  if (!packageId) throw new Error("packageId is required.");

  const target = await getPostgresPool().query<{
    id: string;
    package_key: string;
    status: string;
    title: string;
  }>(
    `SELECT
       package.id,
       package.package_key,
       package.status,
       COALESCE(package.article_identity->>'title', package.external_reference, package.package_key) AS title
     FROM literature_packages package
     JOIN literature_workflow_state workflow
       ON workflow.package_id = package.id
      AND workflow.tenant_id = package.tenant_id
     WHERE package.id = $1
       AND package.tenant_id = $2
       AND workflow.workflow_state = 'HITS_REVIEW'
     LIMIT 1`,
    [packageId, input.principal.tenantId],
  );

  const row = target.rows[0];
  if (!row) {
    throw new Error("The Evidence Package is not eligible for Hits retry in the active tenant.");
  }

  const latest = await getPostgresPool().query<{
    result_payload: Record<string, unknown>;
  }>(
    `SELECT result_payload
     FROM hits_results
     WHERE tenant_id = $1 AND package_id = $2
     ORDER BY result_version DESC, created_at DESC
     LIMIT 1`,
    [input.principal.tenantId, packageId],
  );

  const latestPayload = latest.rows[0]?.result_payload || {};
  if (latestPayload.status !== "HITS_EXECUTION_FAILED") {
    throw new Error("Hits retry is only allowed when the latest Hits execution failed technically.");
  }

  const retryInput: CreatedPackage = {
    packageId: row.id,
    packageKey: row.package_key,
    title: row.title,
    mergedSources: [],
    duplicateMerged: false,
    duplicateSignals: [],
  };

  await getPostgresPool().query(
    `INSERT INTO audit_events (
       tenant_id, package_id, actor_id, event_type, event_category, outcome, details)
     VALUES ($1,$2,$3,'HITS_RETRY_REQUESTED','LITERATURE_HITS','started',$4::jsonb)`,
    [
      input.principal.tenantId,
      packageId,
      input.principal.userId,
      JSON.stringify({ priorStatus: row.status, source: "HITS_REVIEW_UI" }),
    ],
  );

  return processPackage({ principal: input.principal, createdPackage: retryInput });
}
