import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { FullTextArtifact } from "@/lib/literature/full-text/full-text-artifact-service";

export interface PersistWorkflowArticleInput {
  tenantKey: string;
  pmid: string;
  doi?: string;
  title: string;
  searchResult: unknown;
  fetchResult: unknown;
  fullTextArtifact?: FullTextArtifact;
  duplicateResult: {
    isDuplicate: boolean;
    requiresReview: boolean;
    confidence: number;
    matches: unknown[];
  };
  screeningResult: {
    decision: string;
    confidence: number;
  };
}

// Writes one article's full workflow output to Postgres. This is the
// gap found on 2026-08-08: literature_packages, hits_results,
// screening_results, and literature_package_sources already existed as
// real schema (migrations 001, 002, 006), but nothing in the app ever
// wrote to them -- workflow/run returned everything inline in the HTTP
// response and then discarded it. That's why cross-run duplicate
// detection, downloadable reports, and a live Hits screen all currently
// have nothing to read from.
//
// Scope of what this does NOT do yet, deliberately, to keep this
// change reviewable: no ai_executions rows (execution_id left null on
// hits_results/screening_results -- that table is for tracking
// individual LLM calls, out of scope here), no duplicate_assessments
// writes (that table's schema is shaped around the ad-hoc-search flow
// specifically, via a required ad_hoc_literature_results FK that
// workflow/run articles don't have -- reconciling that is a separate
// decision, not bundled into this change).
export async function persistWorkflowArticle(input: PersistWorkflowArticleInput): Promise<void> {
  const pool = getPostgresPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenantResult = await client.query<{ id: string }>(
      "SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1",
      [input.tenantKey],
    );

    const tenantId = tenantResult.rows[0]?.id;

    if (!tenantId) {
      throw new Error(`Unknown tenant_key "${input.tenantKey}" -- cannot persist without a real tenant row.`);
    }

    const packageKey = input.pmid;

    const packageResult = await client.query<{ id: string }>(
      `INSERT INTO literature_packages (tenant_id, package_key, source_type, external_reference, article_identity, status)
       VALUES ($1, $2, 'PubMed', $3, $4::jsonb, $5)
       ON CONFLICT (tenant_id, package_key)
       DO UPDATE SET article_identity = EXCLUDED.article_identity, status = EXCLUDED.status, updated_at = now()
       RETURNING id`,
      [
        tenantId,
        packageKey,
        input.pmid,
        JSON.stringify({ pmid: input.pmid, doi: input.doi, title: input.title }),
        `SCREENED_${input.screeningResult.decision}`,
      ],
    );

    const packageId = packageResult.rows[0].id;

    // The Hits screen's query INNER JOINs this table -- without a row
    // here, a persisted article would silently never appear on Hits at
    // all, even though literature_packages/hits_results/screening_results
    // all have real rows for it.
    await client.query(
      `INSERT INTO literature_workflow_state (package_id, tenant_id, workflow_state, state_version, state_payload)
       VALUES ($1, $2, $3, 1, $4::jsonb)
       ON CONFLICT (package_id)
       DO UPDATE SET workflow_state = EXCLUDED.workflow_state, state_version = literature_workflow_state.state_version + 1, updated_at = now()`,
      [
        packageId,
        tenantId,
        "HITS_REVIEW_PENDING",
        JSON.stringify({ screeningDecision: input.screeningResult.decision }),
      ],
    );

    await client.query(
      `INSERT INTO literature_package_sources (tenant_id, package_id, source_key, source_record_id, pmid, doi)
       VALUES ($1, $2, 'PubMed', $3, $4, $5)
       ON CONFLICT (tenant_id, package_id, source_key, source_record_id) DO NOTHING`,
      [tenantId, packageId, input.pmid, input.pmid, input.doi ?? null],
    );

    if (input.fullTextArtifact) {
      const artifact = input.fullTextArtifact;
      const storageKey = [
        tenantId,
        packageId,
        "source",
        `${artifact.sha256}.pdf`,
      ].join("/");

      const artifactResult = await client.query<{ id: string }>(
        `INSERT INTO evidence_artifacts (
           tenant_id, package_id, artifact_type, storage_backend, storage_key,
           media_type, sha256, size_bytes, metadata, provenance_url,
           retrieved_at, retention_policy
         ) VALUES (
           $1, $2, 'SOURCE_PDF', 'postgres-bytea', $3,
           $4, $5, $6, $7::jsonb, $8, $9, 'retain'
         )
         ON CONFLICT (tenant_id, package_id, artifact_type, storage_key)
         DO UPDATE SET
           metadata = EXCLUDED.metadata,
           provenance_url = EXCLUDED.provenance_url,
           retrieved_at = EXCLUDED.retrieved_at
         RETURNING id`,
        [
          tenantId,
          packageId,
          storageKey,
          artifact.mediaType,
          artifact.sha256,
          artifact.sizeBytes,
          JSON.stringify({
            source: artifact.source,
            pmcid: artifact.pmcid,
            fileName: artifact.fileName,
            pageCount: artifact.pageCount,
            extractedTextLength: artifact.extractedText.length,
          }),
          artifact.provenanceUrl,
          artifact.retrievedAt,
        ],
      );

      await client.query(
        `INSERT INTO evidence_artifact_contents (artifact_id, tenant_id, content)
         VALUES ($1, $2, decode($3, 'base64'))
         ON CONFLICT (artifact_id)
         DO UPDATE SET content = EXCLUDED.content`,
        [artifactResult.rows[0].id, tenantId, artifact.bytesBase64],
      );
    }

    const fullTextSummary = input.fullTextArtifact
      ? {
          source: input.fullTextArtifact.source,
          pmcid: input.fullTextArtifact.pmcid,
          provenanceUrl: input.fullTextArtifact.provenanceUrl,
          sha256: input.fullTextArtifact.sha256,
          sizeBytes: input.fullTextArtifact.sizeBytes,
          pageCount: input.fullTextArtifact.pageCount,
          retrievedAt: input.fullTextArtifact.retrievedAt,
        }
      : undefined;

    const hitsPayload = {
      searchResult: input.searchResult,
      fetchResult: input.fetchResult,
      fullText: fullTextSummary,
      duplicateResult: input.duplicateResult,
    };

    await client.query(
      `INSERT INTO hits_results (tenant_id, package_id, result_version, result_payload, confidence)
       VALUES ($1, $2, 1, $3::jsonb, $4)
       ON CONFLICT (package_id, result_version)
       DO UPDATE SET result_payload = EXCLUDED.result_payload, confidence = EXCLUDED.confidence`,
      [tenantId, packageId, JSON.stringify(hitsPayload), input.duplicateResult.confidence || null],
    );

    await client.query(
      `INSERT INTO screening_results (tenant_id, package_id, result_version, decision, result_payload, confidence)
       VALUES ($1, $2, 1, $3, $4::jsonb, $5)
       ON CONFLICT (package_id, result_version)
       DO UPDATE SET decision = EXCLUDED.decision, result_payload = EXCLUDED.result_payload, confidence = EXCLUDED.confidence`,
      [
        tenantId,
        packageId,
        input.screeningResult.decision,
        JSON.stringify(input.screeningResult),
        (input.screeningResult.confidence ?? 0) / 100 || null,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, package_id, event_type, event_category, outcome, details
       ) VALUES ($1, $2, 'LITERATURE_ARTICLE_PERSISTED', 'LITERATURE_WORKFLOW', 'success', $3::jsonb)`,
      [
        tenantId,
        packageId,
        JSON.stringify({
          pmid: input.pmid,
          doi: input.doi ?? null,
          screeningDecision: input.screeningResult.decision,
          screeningConfidence: input.screeningResult.confidence,
          duplicate: input.duplicateResult.isDuplicate,
          fullTextSha256: input.fullTextArtifact?.sha256 ?? null,
          fullTextPmcid: input.fullTextArtifact?.pmcid ?? null,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[persistWorkflowArticle] Transaction failed and was rolled back:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Looks up whether a PMID or DOI has already been processed for this
// tenant in a previous run, so cross-run duplicate detection has real
// data to check against (in-batch dedup was fixed separately; this is
// the cross-run half of that gap).
export async function findExistingArticlesByIdentity(
  tenantKey: string,
  pmids: string[],
): Promise<Array<{ pmid: string; doi: string | null; title: string; packageId: string }>> {
  if (pmids.length === 0) return [];

  const pool = getPostgresPool();

  const result = await pool.query<{
    pmid: string;
    doi: string | null;
    title: string;
    package_id: string;
  }>(
    `SELECT lps.pmid, lps.doi, lp.article_identity->>'title' AS title, lp.id AS package_id
       FROM literature_package_sources lps
       JOIN literature_packages lp ON lp.id = lps.package_id
       JOIN tenants t ON t.id = lp.tenant_id
      WHERE t.tenant_key = $1
        AND lps.pmid = ANY($2::text[])`,
    [tenantKey, pmids],
  );

  return result.rows.map((row) => ({
    pmid: row.pmid,
    doi: row.doi,
    title: row.title,
    packageId: row.package_id,
  }));
}
