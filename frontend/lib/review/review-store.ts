import { getPostgresPool } from "@/lib/database/postgres";
import type {
  ReviewRecord,
  SaveReviewResponse,
} from "./review-types";

export class ReviewStore {
  async save(
    review: ReviewRecord,
    actorId?: string,
    requestId?: string | null,
  ): Promise<SaveReviewResponse> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ payload: ReviewRecord }>(
        `SELECT payload FROM governed_review_records
          WHERE tenant_id = $1 AND review_id = $2 FOR UPDATE`,
        [review.tenantId, review.id],
      );
      const now = new Date().toISOString();
      const record: ReviewRecord = {
        ...review,
        createdAt: existing.rows[0]?.payload.createdAt ?? review.createdAt ?? now,
        updatedAt: now,
      };
      const saved = await client.query<{ payload: ReviewRecord; review_version: number }>(
        `INSERT INTO governed_review_records (
           tenant_id, review_id, article_id, evidence_package_id, workflow_stage,
           review_status, payload, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
         ON CONFLICT (tenant_id, review_id) DO UPDATE SET
           article_id = EXCLUDED.article_id,
           evidence_package_id = EXCLUDED.evidence_package_id,
           workflow_stage = EXCLUDED.workflow_stage,
           review_status = EXCLUDED.review_status,
           payload = EXCLUDED.payload,
           review_version = governed_review_records.review_version + 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING payload, review_version`,
        [
          review.tenantId,
          review.id,
          review.articleId ?? null,
          review.evidencePackageId ?? null,
          review.workflowStage,
          review.status,
          JSON.stringify(record),
          actorId ?? null,
        ],
      );
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, request_id, details
         ) VALUES ($1, $2, 'GOVERNED_REVIEW_SAVED', 'LITERATURE_REVIEW', 'success', $3, $4::jsonb)`,
        [review.tenantId, actorId ?? null, requestId ?? null, JSON.stringify({
          reviewId: review.id,
          workflowStage: review.workflowStage,
          status: review.status,
          reviewVersion: saved.rows[0].review_version,
        })],
      );
      await client.query("COMMIT");
      return { success: true, review: saved.rows[0].payload };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: string, reviewId: string): Promise<ReviewRecord | undefined> {
    const result = await getPostgresPool().query<{ payload: ReviewRecord }>(
      `SELECT payload FROM governed_review_records WHERE tenant_id = $1 AND review_id = $2`,
      [tenantId, reviewId],
    );
    return result.rows[0]?.payload;
  }

  async listByTenant(tenantId: string): Promise<ReviewRecord[]> {
    const result = await getPostgresPool().query<{ payload: ReviewRecord }>(
      `SELECT payload FROM governed_review_records WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
    return result.rows.map((row) => row.payload);
  }

  async listByWorkflow(
    tenantId: string,
    workflowStage: ReviewRecord["workflowStage"],
  ): Promise<ReviewRecord[]> {
    const result = await getPostgresPool().query<{ payload: ReviewRecord }>(
      `SELECT payload FROM governed_review_records
        WHERE tenant_id = $1 AND workflow_stage = $2 ORDER BY updated_at DESC`,
      [tenantId, workflowStage],
    );
    return result.rows.map((row) => row.payload);
  }
}

export const reviewRepository = new ReviewStore();
