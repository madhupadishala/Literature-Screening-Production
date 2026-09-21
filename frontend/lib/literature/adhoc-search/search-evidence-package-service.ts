import "server-only";

import { createHash } from "node:crypto";

import {
  configurationSnapshotPayload,
  resolveActiveConfigurations,
} from "@/lib/configuration/active-resolver";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import type {
  AdHocSearchCriteria,
  SearchExecutionPurpose,
} from "@/lib/literature/adhoc-search/types";

export interface SearchEvidencePackageSummary {
  packageId: string;
  packageKey: string;
  sha256: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function createSearchEvidencePackage(input: {
  principal: RequestPrincipal;
  searchId: string;
  searchKey: string;
  executionPurpose: SearchExecutionPurpose;
  criteria: AdHocSearchCriteria;
  selectedSources: string[];
  translatedQueries: Record<string, string>;
  connectorErrors: Record<string, string>;
  resultCount: number;
  status: "completed" | "partial" | "failed";
  durationMs: number;
  startedAt: string;
  completedAt: string;
}): Promise<SearchEvidencePackageSummary | undefined> {
  if (
    input.executionPurpose !== "MANUAL_PRODUCTION" &&
    input.executionPurpose !== "SCHEDULED_PRODUCTION"
  ) {
    return undefined;
  }

  const pool = getPostgresPool();
  const existing = await pool.query<{
    id: string;
    package_key: string;
    content_sha256: string;
  }>(
    `SELECT id, package_key, content_sha256
     FROM literature_search_evidence_packages
     WHERE tenant_id = $1 AND search_id = $2`,
    [input.principal.tenantId, input.searchId],
  );
  if (existing.rows[0]) {
    return {
      packageId: existing.rows[0].id,
      packageKey: existing.rows[0].package_key,
      sha256: existing.rows[0].content_sha256,
    };
  }

  const active = await resolveActiveConfigurations(input.principal.tenantId);
  const configurationSnapshot = configurationSnapshotPayload(active);
  const packageKey = "SEP-" + input.searchKey;
  const payload = {
    schemaVersion: "clinixai.literature.search-evidence.v1",
    packageKey,
    searchId: input.searchId,
    searchKey: input.searchKey,
    executionPurpose: input.executionPurpose,
    execution: {
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      resultCount: input.resultCount,
    },
    criteria: input.criteria,
    selectedSources: input.selectedSources,
    translatedQueries: input.translatedQueries,
    connectorErrors: input.connectorErrors,
    configurationSnapshot,
    governance: {
      productionSearch: true,
      validationPackageSeparate: true,
      createdBy: {
        userId: input.principal.userId,
        displayName: input.principal.displayName,
        role: input.principal.roleKey,
      },
    },
  };
  const serialized = JSON.stringify(payload);
  const digest = sha256(serialized);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{
      id: string;
      package_key: string;
      content_sha256: string;
    }>(
      `INSERT INTO literature_search_evidence_packages (
         tenant_id, search_id, package_key, execution_purpose,
         payload, content_sha256, created_by
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (tenant_id, search_id) DO NOTHING
       RETURNING id, package_key, content_sha256`,
      [
        input.principal.tenantId,
        input.searchId,
        packageKey,
        input.executionPurpose,
        serialized,
        digest,
        input.principal.userId,
      ],
    );

    const row =
      inserted.rows[0] ||
      (
        await client.query<{
          id: string;
          package_key: string;
          content_sha256: string;
        }>(
          `SELECT id, package_key, content_sha256
           FROM literature_search_evidence_packages
           WHERE tenant_id = $1 AND search_id = $2`,
          [input.principal.tenantId, input.searchId],
        )
      ).rows[0];

    if (!row) {
      throw new Error("Search Evidence Package could not be created.");
    }

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1, $2, 'SEARCH_EVIDENCE_PACKAGE_CREATED',
         'LITERATURE_SEARCH', 'success', $3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          searchId: input.searchId,
          searchKey: input.searchKey,
          executionPurpose: input.executionPurpose,
          searchEvidencePackageId: row.id,
          searchEvidencePackageKey: row.package_key,
          sha256: row.content_sha256,
        }),
      ],
    );
    await client.query("COMMIT");

    return {
      packageId: row.id,
      packageKey: row.package_key,
      sha256: row.content_sha256,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
