import { type NextRequest } from "next/server";

import { runGovernedDatabaseMigrations } from "@/lib/database/governed-migration-runner";
import { getPostgresPool } from "@/lib/database/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function looksLikeLabel(input: {
  document_key: string;
  title: string;
  source_reference: string;
  source_file: string;
  domain: string;
}): boolean {
  const haystack = [
    input.document_key,
    input.title,
    input.source_reference,
    input.source_file,
    input.domain,
  ].join(" ").toLowerCase();
  return /\b(smpc|spc|ccds|ccsi|uspi|package insert|prescribing information|reference safety|rsi|investigator.?s brochure|ib\b|local product|label(?:ing)?|product information)\b/.test(haystack);
}

export async function GET(_request: NextRequest): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404 });
  }

  const migration = await runGovernedDatabaseMigrations();
  const pool = getPostgresPool();

  const repositories = await pool.query<{
    tenant_id: string;
    tenant_key: string;
    repository_id: string;
    repository_key: string;
    version_label: string;
  }>(
    `SELECT t.id::text AS tenant_id,
            t.tenant_key,
            r.id::text AS repository_id,
            r.repository_key,
            r.version_label
       FROM tenants t
       JOIN controlled_knowledge_repositories r ON r.tenant_id = t.id
      WHERE t.status = 'active'
        AND r.lifecycle_status = 'active'
      ORDER BY t.tenant_key, r.repository_key`,
  );

  const inventories = [];
  for (const repository of repositories.rows) {
    const documents = await pool.query<{
      document_key: string;
      title: string;
      version_label: string;
      governance_status: string;
      production_eligible: boolean;
      source_reference: string;
      source_file: string;
      domain: string;
      metadata: Record<string, unknown>;
      chunk_count: number;
    }>(
      `SELECT d.document_key,
              d.title,
              d.version_label,
              d.governance_status,
              d.production_eligible,
              coalesce(d.source_reference, '') AS source_reference,
              coalesce(d.metadata->>'sourceFile', '') AS source_file,
              coalesce(d.metadata->>'domain', '') AS domain,
              d.metadata,
              count(c.id)::int AS chunk_count
         FROM knowledge_documents d
         LEFT JOIN knowledge_chunks c
           ON c.document_id = d.id
          AND c.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1
          AND d.controlled_repository_id = $2
        GROUP BY d.id
        ORDER BY d.document_key`,
      [repository.tenant_id, repository.repository_id],
    );

    const labelCandidates = documents.rows.filter((doc) => looksLikeLabel(doc));
    inventories.push({
      ...repository,
      documentCount: documents.rows.length,
      labelCandidateCount: labelCandidates.length,
      labelCandidates: labelCandidates.map((doc) => ({
        documentKey: doc.document_key,
        title: doc.title,
        version: doc.version_label,
        governanceStatus: doc.governance_status,
        productionEligible: doc.production_eligible,
        sourceReference: doc.source_reference,
        sourceFile: doc.source_file,
        domain: doc.domain,
        chunkCount: doc.chunk_count,
        metadata: doc.metadata,
      })),
    });
  }

  return Response.json({
    status: "OK",
    migration: {
      migrationCount: migration.migrationCount,
      maxMigration: migration.maxMigration,
    },
    repositoryCount: inventories.length,
    inventories,
  });
}
