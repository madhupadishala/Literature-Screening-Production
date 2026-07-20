import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPostgresPool } from "@/lib/database/postgres";
import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
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
};

function evidenceRoot(): string {
  const configured = process.env.EVIDENCE_STORE_ROOT?.trim();
  if (configured) return path.resolve(configured);

  const environment =
    process.env.APP_ENVIRONMENT?.trim().toLowerCase() ||
    process.env.NODE_ENV?.trim().toLowerCase();

  if (environment === "production") {
    throw new Error(
      "EVIDENCE_STORE_ROOT must be configured in production.",
    );
  }

  return path.resolve(process.cwd(), "..", "evidence_store");
}

function safeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

function packageKeyFor(row: SearchResultRow): string {
  const identity =
    row.pmid ||
    row.doi ||
    row.source_record_id ||
    randomUUID().slice(0, 12);

  return safeSegment(
    `ADHOC_${row.source_key}_${identity}_${randomUUID().slice(0, 8)}`,
  );
}

async function writeJson(
  filePath: string,
  payload: unknown,
): Promise<void> {
  await writeFile(
    filePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

export async function createEvidencePackagesFromSearch(input: {
  principal: RequestPrincipal;
  resultIds: string[];
}): Promise<Array<{
  packageId: string;
  packageKey: string;
  title: string;
  mergedSources: string[];
}>> {
  const uniqueIds = [...new Set(input.resultIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("Select at least one literature result.");
  }
  if (uniqueIds.length > 100) {
    throw new Error(
      "A maximum of 100 search results can be converted in one action.",
    );
  }

  const pool = getPostgresPool();
  const result = await pool.query<SearchResultRow>(
    `
      SELECT *
      FROM ad_hoc_literature_results
      WHERE tenant_id = $1
        AND id = ANY($2::uuid[])
      ORDER BY created_at
    `,
    [input.principal.tenantId, uniqueIds],
  );

  if (result.rows.length !== uniqueIds.length) {
    throw new Error(
      "One or more selected results were not found in the active tenant.",
    );
  }

  const grouped = new Map<string, SearchResultRow[]>();
  for (const row of result.rows) {
    const records = grouped.get(row.dedupe_key) || [];
    records.push(row);
    grouped.set(row.dedupe_key, records);
  }

  const active = await resolveActiveConfigurations(input.principal.tenantId);
  const snapshotPayload = configurationSnapshotPayload(active);
  const created: Array<{
    packageId: string;
    packageKey: string;
    title: string;
    mergedSources: string[];
  }> = [];

  for (const rows of grouped.values()) {
    const primary = rows[0];
    const packageKey = packageKeyFor(primary);
    const packageFolder = path.join(
      evidenceRoot(),
      safeSegment(input.principal.tenantKey),
      packageKey,
    );

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const packageResult = await client.query<{ id: string }>(
        `
          INSERT INTO literature_packages (
            tenant_id,
            package_key,
            source_type,
            external_reference,
            article_identity,
            product_context,
            status,
            created_by
          )
          VALUES (
            $1,
            $2,
            'AD_HOC_GLOBAL_SEARCH',
            $3,
            $4::jsonb,
            $5::jsonb,
            'NEW',
            $6
          )
          RETURNING id
        `,
        [
          input.principal.tenantId,
          packageKey,
          primary.pmid || primary.doi || primary.source_record_id,
          JSON.stringify({
            title: primary.title,
            pmid: primary.pmid,
            doi: primary.doi,
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
        `
          INSERT INTO literature_workflow_state (
            package_id,
            tenant_id,
            workflow_state,
            state_payload,
            updated_by
          )
          VALUES (
            $1,
            $2,
            'NEW',
            $3::jsonb,
            $4
          )
        `,
        [
          packageId,
          input.principal.tenantId,
          JSON.stringify({
            origin: "AD_HOC_GLOBAL_SEARCH",
            searchId: primary.search_id,
            sourceResultIds: rows.map((row) => row.id),
          }),
          input.principal.userId,
        ],
      );

      await client.query(
        `
          INSERT INTO package_configuration_snapshots (
            package_id,
            tenant_id,
            search_execution_id,
            product_master_version_id,
            literature_calendar_version_id,
            client_guideline_version_ids,
            outcome_template_version_id,
            snapshot_payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb
          )
        `,
        [
          packageId,
          input.principal.tenantId,
          primary.search_id,
          active.productMaster?.id || null,
          active.literatureCalendar?.id || null,
          JSON.stringify(
            active.clientGuidelines.map((record) => record.id),
          ),
          active.outcomeTemplate?.id || null,
          JSON.stringify(snapshotPayload),
        ],
      );

      await client.query(
        `
          UPDATE ad_hoc_literature_results
          SET
            selected = true,
            evidence_package_id = $2
          WHERE tenant_id = $1
            AND id = ANY($3::uuid[])
        `,
        [
          input.principal.tenantId,
          packageId,
          rows.map((row) => row.id),
        ],
      );

      await client.query(
        `
          UPDATE ad_hoc_literature_searches
          SET selected_count = (
            SELECT count(*)
            FROM ad_hoc_literature_results
            WHERE search_id = $1
              AND selected = true
          )
          WHERE id = $1
        `,
        [primary.search_id],
      );

      await mkdir(packageFolder, { recursive: true });

      const metadata = {
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

      await writeJson(path.join(packageFolder, "metadata.json"), metadata);
      const resolvedProduct =
        primary.match_metadata?.resolvedProduct || {};

      await writeJson(path.join(packageFolder, "products.json"), {
        products:
          resolvedProduct &&
          typeof resolvedProduct === "object" &&
          "sourceRecord" in resolvedProduct &&
          resolvedProduct.sourceRecord
            ? [resolvedProduct.sourceRecord]
            : [],
        resolved_product_context: resolvedProduct,
        product_master_version:
          active.productMaster?.versionLabel || null,
      });

      await writeJson(
        path.join(packageFolder, "active_configuration.json"),
        {
          snapshot: snapshotPayload,
          product_master: active.productMaster?.payload || null,
          literature_calendar: active.literatureCalendar?.payload || null,
          client_guidelines: active.clientGuidelines.map((record) => ({
            id: record.id,
            key: record.configKey,
            version: record.versionLabel,
            payload: record.payload,
          })),
          outcome_template: active.outcomeTemplate?.payload || null,
        },
      );
      await writeJson(path.join(packageFolder, "workflow_state.json"), {
        status: "NEW",
        package_id: packageKey,
        origin: "AD_HOC_GLOBAL_SEARCH",
        updated_at: new Date().toISOString(),
        history: [
          {
            timestamp: new Date().toISOString(),
            from_status: null,
            to_status: "NEW",
            reason:
              "Evidence Package created from RBAC-controlled Ad Hoc Global Search.",
            actor: input.principal.email,
          },
        ],
      });

      await client.query(
        `
          INSERT INTO audit_events (
            tenant_id,
            package_id,
            actor_id,
            event_type,
            event_category,
            outcome,
            details
          )
          VALUES (
            $1,
            $2,
            $3,
            'EVIDENCE_PACKAGE_CREATED',
            'LITERATURE_SEARCH',
            'success',
            $4::jsonb
          )
        `,
        [
          input.principal.tenantId,
          packageId,
          input.principal.userId,
          JSON.stringify({
            packageKey,
            searchId: primary.search_id,
            sourceResultIds: rows.map((row) => row.id),
            mergedSources: rows.map((row) => row.source_key),
            configurationSnapshot: snapshotPayload,
          }),
        ],
      );

      await client.query("COMMIT");

      created.push({
        packageId,
        packageKey,
        title: primary.title,
        mergedSources: [...new Set(rows.map((row) => row.source_key))],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await rm(packageFolder, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  return created;
}
