import { createHash } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import type { RAGMergedContext } from "@/lib/rag/rag-types";
import type { ReviewRecord } from "@/lib/review/review-types";

import type {
  EvidenceAIRuntime,
  EvidenceArticleInformation,
  EvidencePackage,
} from "./evidence-types";

interface BuildEvidencePackageInput {
  tenantId: string;

  articleId?: string;

  article: EvidenceArticleInformation;

  ragContext: RAGMergedContext;

  aiExecution: EvidenceAIRuntime;

  aiResult: unknown;

  review?: ReviewRecord;

  generatedBy?: string;
  actorId?: string;
  requestId?: string | null;
}

export class EvidencePackageGenerator {
  async build(
    input: BuildEvidencePackageInput,
  ): Promise<EvidencePackage> {
    const packageHash = createHash("sha256").update(
      JSON.stringify({
        article: input.article,
        rag: input.ragContext.summary,
        ai: input.aiResult,
        review: input.review,
      }),
    ).digest("hex");
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const packageRow = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO literature_packages (
           tenant_id, package_key, source_type, external_reference, article_identity,
           status, created_by
         ) VALUES ($1, gen_random_uuid()::text, 'EvidenceBuilder', $2, $3::jsonb, 'EVIDENCE_DRAFT', $4)
         RETURNING id, created_at`,
        [input.tenantId, input.articleId ?? null, JSON.stringify(input.article), input.actorId ?? null],
      );
      const packageId = packageRow.rows[0].id;
      const createdAt = packageRow.rows[0].created_at.toISOString();

      const evidencePackage: EvidencePackage = {
        metadata: {
          packageId,
          tenantId: input.tenantId,

          articleId: input.articleId,

          packageVersion: 1,

          packageHash,

          createdAt,

          generatedBy:
            input.generatedBy ??
            "ClinixAI Evidence Builder",

          status: input.review
            ? "reviewed"
            : "draft",
        },

      article: input.article,

      ragContext: input.ragContext,

      aiExecution: input.aiExecution,

      aiResult: input.aiResult,

      review: input.review,

      auditReferences: input.review
        ? [input.review.id]
        : [],

      notes: [],
      };
      await client.query(
        `INSERT INTO evidence_package_snapshots (
           package_id, tenant_id, package_version, package_hash, status, payload, created_by
         ) VALUES ($1, $2, 1, $3, $4, $5::jsonb, $6)`,
        [packageId, input.tenantId, packageHash, evidencePackage.metadata.status,
          JSON.stringify(evidencePackage), input.actorId ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, package_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, $3, 'EVIDENCE_PACKAGE_CREATED', 'EVIDENCE_PACKAGE', 'success', $4, $5::jsonb)`,
        [input.tenantId, packageId, input.actorId ?? null, input.requestId ?? null,
          JSON.stringify({ packageHash, packageVersion: 1, articleId: input.articleId ?? null })],
      );
      await client.query("COMMIT");
      return evidencePackage;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(
    tenantId: string,
    packageId: string,
  ): Promise<EvidencePackage | undefined> {
    const result = await getPostgresPool().query<{ payload: EvidencePackage }>(
      `SELECT payload FROM evidence_package_snapshots WHERE tenant_id = $1 AND package_id = $2`,
      [tenantId, packageId],
    );
    return result.rows[0]?.payload;
  }

  async list(
    tenantId: string,
  ): Promise<EvidencePackage[]> {
    const result = await getPostgresPool().query<{ payload: EvidencePackage }>(
      `SELECT payload FROM evidence_package_snapshots WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
    return result.rows.map((row) => row.payload);
  }

  async archive(
    tenantId: string,
    packageId: string,
  ): Promise<boolean> {
    const result = await getPostgresPool().query(
      `UPDATE evidence_package_snapshots SET status = 'archived',
         payload = jsonb_set(payload, '{metadata,status}', '"archived"'::jsonb), updated_at = now()
       WHERE tenant_id = $1 AND package_id = $2`,
      [tenantId, packageId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const evidencePackageGenerator =
  new EvidencePackageGenerator();
