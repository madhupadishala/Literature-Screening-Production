import "server-only";

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import type {
  AdHocSearchCriteria,
  LiteratureSource,
  NormalizedLiteratureResult,
} from "@/lib/literature/adhoc-search/types";

const DEFAULT_SOURCES = [
  {
    sourceKey: "PUBMED",
    displayName: "PubMed / MEDLINE",
    connectorType: "PUBMED_EUTILITIES",
    baseUrl:
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
    maxResults: 200,
  },
  {
    sourceKey: "EUROPE_PMC",
    displayName: "Europe PMC",
    connectorType: "EUROPE_PMC_REST",
    baseUrl:
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    maxResults: 200,
  },
  {
    sourceKey: "CROSSREF",
    displayName: "Crossref",
    connectorType: "CROSSREF_REST",
    baseUrl: "https://api.crossref.org/v1/works",
    maxResults: 200,
  },
] as const;

function sourceFromRow(row: Record<string, unknown>): LiteratureSource {
  return {
    sourceKey: String(row.source_key),
    displayName: String(row.display_name),
    connectorType: String(row.connector_type),
    enabled: Boolean(row.enabled),
    baseUrl: String(row.base_url),
    maxResults: Number(row.max_results),
    settings:
      (row.settings as Record<string, unknown>) || {},
  };
}

export async function ensureDefaultLiteratureSources(
  principal: RequestPrincipal,
): Promise<void> {
  const pool = getPostgresPool();

  for (const source of DEFAULT_SOURCES) {
    await pool.query(
      `
        INSERT INTO literature_source_connectors (
          tenant_id,
          source_key,
          display_name,
          connector_type,
          enabled,
          base_url,
          max_results,
          settings,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, true, $5, $6, '{}'::jsonb, $7, $7)
        ON CONFLICT (tenant_id, source_key)
        DO NOTHING
      `,
      [
        principal.tenantId,
        source.sourceKey,
        source.displayName,
        source.connectorType,
        source.baseUrl,
        source.maxResults,
        principal.userId,
      ],
    );
  }
}

export async function listLiteratureSources(
  principal: RequestPrincipal,
): Promise<LiteratureSource[]> {
  await ensureDefaultLiteratureSources(principal);

  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT *
      FROM literature_source_connectors
      WHERE tenant_id = $1
      ORDER BY display_name
    `,
    [principal.tenantId],
  );

  return result.rows.map(sourceFromRow);
}

export async function updateLiteratureSource(input: {
  principal: RequestPrincipal;
  sourceKey: string;
  enabled?: boolean;
  maxResults?: number;
  settings?: Record<string, unknown>;
  credentialReference?: string | null;
}): Promise<LiteratureSource> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      UPDATE literature_source_connectors
      SET
        enabled = COALESCE($3, enabled),
        max_results = COALESCE($4, max_results),
        settings = COALESCE($5::jsonb, settings),
        credential_reference = CASE
          WHEN $6::boolean THEN $7
          ELSE credential_reference
        END,
        updated_by = $8,
        updated_at = now()
      WHERE tenant_id = $1
        AND source_key = $2
      RETURNING *
    `,
    [
      input.principal.tenantId,
      input.sourceKey,
      input.enabled ?? null,
      input.maxResults ?? null,
      input.settings ? JSON.stringify(input.settings) : null,
      input.credentialReference !== undefined,
      input.credentialReference ?? null,
      input.principal.userId,
    ],
  );

  if (!result.rows[0]) {
    throw new Error("Literature source was not found.");
  }

  return sourceFromRow(result.rows[0]);
}

export async function createSearchExecution(input: {
  principal: RequestPrincipal;
  criteria: AdHocSearchCriteria;
  selectedSources: string[];
}): Promise<{ id: string; searchKey: string }> {
  const searchKey = `SEARCH-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;

  const result = await getPostgresPool().query<{ id: string }>(
    `
      INSERT INTO ad_hoc_literature_searches (
        search_key,
        tenant_id,
        executed_by,
        criteria,
        selected_sources
      )
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      RETURNING id
    `,
    [
      searchKey,
      input.principal.tenantId,
      input.principal.userId,
      JSON.stringify(input.criteria),
      JSON.stringify(input.selectedSources),
    ],
  );

  return { id: result.rows[0].id, searchKey };
}

export async function completeSearchExecution(input: {
  searchId: string;
  status: "completed" | "partial" | "failed";
  resultCount: number;
  durationMs: number;
  translatedQueries: Record<string, string>;
  connectorErrors: Record<string, string>;
}): Promise<void> {
  await getPostgresPool().query(
    `
      UPDATE ad_hoc_literature_searches
      SET
        status = $2,
        result_count = $3,
        duration_ms = $4,
        translated_queries = $5::jsonb,
        connector_errors = $6::jsonb,
        completed_at = now()
      WHERE id = $1
    `,
    [
      input.searchId,
      input.status,
      input.resultCount,
      input.durationMs,
      JSON.stringify(input.translatedQueries),
      JSON.stringify(input.connectorErrors),
    ],
  );
}

export async function storeSearchResults(input: {
  principal: RequestPrincipal;
  searchId: string;
  results: NormalizedLiteratureResult[];
}): Promise<Array<NormalizedLiteratureResult & { id: string }>> {
  const pool = getPostgresPool();
  const stored: Array<NormalizedLiteratureResult & { id: string }> = [];

  for (const result of input.results) {
    const inserted = await pool.query<{ id: string }>(
      `
        INSERT INTO ad_hoc_literature_results (
          search_id,
          tenant_id,
          source_key,
          source_record_id,
          pmid,
          doi,
          title,
          authors,
          journal,
          publication_date,
          language,
          publication_type,
          abstract_text,
          landing_url,
          full_text_status,
          match_metadata,
          dedupe_key,
          duplicate_group
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9,
          $10::date, $11, $12, $13, $14, $15, $16::jsonb, $17, $18
        )
        ON CONFLICT (search_id, source_key, source_record_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          authors = EXCLUDED.authors,
          journal = EXCLUDED.journal,
          publication_date = EXCLUDED.publication_date,
          abstract_text = EXCLUDED.abstract_text,
          match_metadata = EXCLUDED.match_metadata
        RETURNING id
      `,
      [
        input.searchId,
        input.principal.tenantId,
        result.sourceKey,
        result.sourceRecordId,
        result.pmid || null,
        result.doi || null,
        result.title,
        JSON.stringify(result.authors),
        result.journal || null,
        result.publicationDate || null,
        result.language || null,
        result.publicationType || null,
        result.abstractText || null,
        result.landingUrl || null,
        result.fullTextStatus,
        JSON.stringify(result.matchMetadata),
        result.dedupeKey,
        result.duplicateGroup || null,
      ],
    );

    stored.push({ ...result, id: inserted.rows[0].id });
  }

  return stored;
}

export async function listRecentSearches(
  principal: RequestPrincipal,
  limit = 25,
): Promise<Record<string, unknown>[]> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `
      SELECT
        id,
        search_key,
        criteria,
        selected_sources,
        translated_queries,
        status,
        result_count,
        selected_count,
        duration_ms,
        connector_errors,
        created_at,
        completed_at
      FROM ad_hoc_literature_searches
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [principal.tenantId, Math.max(1, Math.min(limit, 100))],
  );

  return result.rows;
}
