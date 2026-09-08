import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";

export interface ControlledVectorStatus {
  provider: "pgvector";
  activeRepositories: number;
  productionEligibleVectors: number;
  tenantId: string;
}

export async function getControlledVectorStatus(
  tenantId: string,
): Promise<ControlledVectorStatus> {
  const result = await getPostgresPool().query<{
    active_repositories: string;
    production_vectors: string;
  }>(
    `SELECT
       count(DISTINCT repository.id)::text AS active_repositories,
       count(chunk.id)::text AS production_vectors
     FROM controlled_knowledge_repositories repository
     LEFT JOIN knowledge_documents document
       ON document.controlled_repository_id = repository.id
      AND document.tenant_id = repository.tenant_id
      AND document.governance_status = 'effective'
      AND document.production_eligible IS TRUE
     LEFT JOIN knowledge_chunks chunk
       ON chunk.document_id = document.id
      AND chunk.tenant_id = repository.tenant_id
      AND chunk.embedding IS NOT NULL
      AND chunk.embedding_model = repository.embedding_model
      AND chunk.embedding_dimensions = repository.embedding_dimensions
      AND chunk.metadata->>'status' = 'Approved'
      AND chunk.metadata->>'effectiveForProduction' = 'true'
     WHERE repository.tenant_id = $1
       AND repository.lifecycle_status = 'active'`,
    [tenantId],
  );
  return { provider: "pgvector", tenantId,
    activeRepositories: Number(result.rows[0]?.active_repositories || 0),
    productionEligibleVectors: Number(result.rows[0]?.production_vectors || 0) };
}
