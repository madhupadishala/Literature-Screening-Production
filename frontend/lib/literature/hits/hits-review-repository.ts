import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

import type {
  HitsReviewDecision,
  HitsReviewStatus,
  HitsWorklistRecord,
  SaveHitsReviewInput,
  SavedHitsReview,
} from "./hits-review-types";

interface HitsWorklistRow {
  hit_id: string;
  hits_result_id: string;
  database_package_id: string;
  package_id: string;
  result_version: number;
  external_reference: string | null;
  article_identity: Record<string, unknown>;
  product_context: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  confidence: string | number | null;
  review_status: HitsReviewStatus | null;
  decision: HitsReviewDecision | null;
  comments: string | null;
  review_version: number | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  workflow_state: string;
  duplicate_source_count: string | number;
  duplicate_confidence: string | number | null;
  duplicate_signals: unknown;
}

interface ReviewRow {
  id: string;
  package_id: string;
  hits_result_id: string;
  review_status: HitsReviewStatus;
  decision: HitsReviewDecision;
  comments: string | null;
  review_version: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return isRecord(record[key]) ? record[key] : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function decisionFor(status: HitsReviewStatus): HitsReviewDecision {
  switch (status) {
    case "approved":
      return "accept_ai";
    case "dismissed":
      return "reject_hit";
    case "flagged":
      return "needs_second_review";
    default:
      return "pending";
  }
}

function validateReview(input: SaveHitsReviewInput): void {
  if (!input.packageId?.trim()) throw new Error("packageId is required.");
  if (!input.hitsResultId?.trim()) throw new Error("hitsResultId is required.");
  if (!["pending", "approved", "dismissed", "flagged"].includes(input.status)) {
    throw new Error("Invalid Hits review status.");
  }
  if (
    (input.status === "dismissed" || input.status === "flagged") &&
    (!input.comments || input.comments.trim().length < 3)
  ) {
    throw new Error("A review comment is required when dismissing or flagging a Hit.");
  }
  if (
    input.expectedVersion !== undefined &&
    (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0)
  ) {
    throw new Error("expectedVersion must be a non-negative integer.");
  }
}

function mapWorklistRow(row: HitsWorklistRow): HitsWorklistRecord {
  const payload = row.result_payload || {};
  const result = recordValue(payload, "result");
  const article = recordValue(payload, "article");
  const identity = row.article_identity || {};
  const product = row.product_context || {};
  const resolvedProduct = recordValue(product, "resolvedProduct");
  const detectedProducts = stringArray(result.detectedProducts);
  const assessments = Array.isArray(result.companySuspectAssessments)
    ? result.companySuspectAssessments.filter(isRecord)
    : [];
  const assessment = assessments[0] || {};
  const selectedCandidate = recordValue(assessment, "selectedCandidate");
  const decisionTrail = Array.isArray(assessment.decisionTrail)
    ? assessment.decisionTrail.filter(isRecord)
    : [];
  const reasons = stringArray(result.reasons);
  const productName =
    detectedProducts[0] ||
    stringValue(resolvedProduct.preferredName) ||
    stringValue(product.productName) ||
    "Unknown Product";

  return {
    hit_id: row.hit_id,
    hits_result_id: row.hits_result_id,
    database_package_id: row.database_package_id,
    package_id: row.package_id,
    result_version: row.result_version,
    pmid:
      stringValue(article.pmid) ||
      stringValue(identity.pmid) ||
      stringValue(row.external_reference, "—"),
    doi: stringValue(article.doi) || stringValue(identity.doi) || undefined,
    title: stringValue(article.title) || stringValue(identity.title, "—"),
    journal: stringValue(identity.journal, "—"),
    publication_date: stringValue(identity.publicationDate, "—"),
    product_name: productName,
    normalized_identity:
      stringValue(assessment.normalizedProduct) ||
      stringValue(resolvedProduct.preferredName) ||
      productName,
    matched_term:
      stringValue(selectedCandidate.matchedName) ||
      stringValue(product.matchedTerm, "—"),
    match_type:
      stringValue(assessment.relationship) ||
      stringValue(product.matchType, "—"),
    match_source: assessments.length
      ? `PPI ${stringValue(assessment.knowledgeVersion, "governed")}`
      : stringValue(product.matchSource, "GOVERNED_PRODUCT_CONTEXT"),
    company_product_status:
      stringValue(assessment.conclusion) ||
      stringValue(result.classification, "needs_manual_review"),
    author_country: stringValue(identity.authorCountry, "—"),
    country_of_interest:
      stringValue(assessment.countryOfInterest) ||
      stringValue(product.countryOfInterest, "—"),
    mah_country_match: assessment.companySuspect === true
      ? true
      : booleanValue(product.mahCountryMatch),
    pii_present: booleanValue(result.piiPresent),
    confidence_score: numberValue(row.confidence),
    qc_required: booleanValue(result.qcRequired),
    duplicate_detected: numberValue(row.duplicate_source_count) > 0,
    duplicate_source_count: numberValue(row.duplicate_source_count),
    duplicate_confidence: numberValue(row.duplicate_confidence),
    duplicate_signals: stringArray(row.duplicate_signals),
    evidence_sentence:
      stringValue(decisionTrail[0]?.explanation) ||
      reasons[0] ||
      "No evidence rationale was returned.",
    ai_summary: reasons.join(" ") || "Manual Hits review is required.",
    review_status: row.review_status || "pending",
    review_decision: row.decision || "pending",
    review_comments: row.comments || undefined,
    review_version: row.review_version || 0,
    reviewed_at: row.reviewed_at || undefined,
    reviewed_by: row.reviewed_by || undefined,
    workflow_state: row.workflow_state,
  };
}

export async function listHitsForReview(input: {
  principal: RequestPrincipal;
  status?: HitsReviewStatus;
  limit?: number;
}): Promise<HitsWorklistRecord[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 250, 500));
  const result = await getPostgresPool().query<HitsWorklistRow>(
    `
      WITH latest_hits AS (
        SELECT DISTINCT ON (package_id)
          id, tenant_id, package_id, result_version,
          result_payload, confidence, created_at
        FROM hits_results
        WHERE tenant_id = $1
        ORDER BY package_id, result_version DESC, created_at DESC
      )
      SELECT
        latest.id AS hit_id,
        latest.id AS hits_result_id,
        package.id AS database_package_id,
        package.package_key AS package_id,
        latest.result_version,
        package.external_reference,
        package.article_identity,
        package.product_context,
        latest.result_payload,
        latest.confidence,
        review.review_status,
        review.decision,
        review.comments,
        review.review_version,
        review.reviewed_at,
        reviewer.display_name AS reviewed_by,
        workflow.workflow_state,
        COALESCE(duplicates.duplicate_source_count, 0) AS duplicate_source_count,
        duplicates.duplicate_confidence,
        COALESCE(duplicates.duplicate_signals, '[]'::jsonb) AS duplicate_signals
      FROM latest_hits latest
      JOIN literature_packages package
        ON package.id = latest.package_id
       AND package.tenant_id = latest.tenant_id
      JOIN literature_workflow_state workflow
        ON workflow.package_id = package.id
       AND workflow.tenant_id = package.tenant_id
      LEFT JOIN hits_reviews review
        ON review.tenant_id = latest.tenant_id
       AND review.package_id = latest.package_id
       AND review.hits_result_id = latest.id
      LEFT JOIN application_users reviewer
        ON reviewer.id = review.reviewed_by
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE assessment.classification = 'duplicate')
            AS duplicate_source_count,
          max(assessment.confidence) FILTER (
            WHERE assessment.classification = 'duplicate'
          ) AS duplicate_confidence,
          (
            SELECT jsonb_agg(DISTINCT signal)
            FROM duplicate_assessments signal_assessment
            CROSS JOIN LATERAL jsonb_array_elements_text(
              signal_assessment.match_signals
            ) AS signals(signal)
            WHERE signal_assessment.tenant_id = latest.tenant_id
              AND signal_assessment.canonical_package_id = latest.package_id
              AND signal_assessment.classification = 'duplicate'
          ) AS duplicate_signals
        FROM duplicate_assessments assessment
        WHERE assessment.tenant_id = latest.tenant_id
          AND assessment.canonical_package_id = latest.package_id
      ) duplicates ON true
      WHERE latest.tenant_id = $1
        AND ($2::text IS NULL OR COALESCE(review.review_status, 'pending') = $2)
      ORDER BY latest.created_at DESC
      LIMIT $3
    `,
    [input.principal.tenantId, input.status ?? null, limit],
  );

  return result.rows.map(mapWorklistRow);
}

export async function saveHitsReview(input: {
  principal: RequestPrincipal;
  review: SaveHitsReviewInput;
}): Promise<SavedHitsReview> {
  validateReview(input.review);
  const comments = input.review.comments?.trim() || null;
  const decision = decisionFor(input.review.status);
  const workflowState =
    input.review.status === "approved" ? "HITS_COMPLETE" : "HITS_REVIEW";
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");
    const target = await client.query<{
      package_id: string;
      hits_result_id: string;
    }>(
      `
        SELECT package.id AS package_id, hits.id AS hits_result_id
        FROM literature_packages package
        JOIN hits_results hits
          ON hits.package_id = package.id
         AND hits.tenant_id = package.tenant_id
        WHERE package.tenant_id = $1
          AND package.id = $2
          AND hits.id = $3
        FOR UPDATE OF package, hits
      `,
      [
        input.principal.tenantId,
        input.review.packageId,
        input.review.hitsResultId,
      ],
    );
    if (!target.rows[0]) {
      throw new Error("The Hits record was not found in the active tenant.");
    }

    const existing = await client.query<{ review_version: number }>(
      `
        SELECT review_version
        FROM hits_reviews
        WHERE tenant_id = $1 AND package_id = $2 AND hits_result_id = $3
        FOR UPDATE
      `,
      [
        input.principal.tenantId,
        input.review.packageId,
        input.review.hitsResultId,
      ],
    );
    const currentVersion = existing.rows[0]?.review_version ?? 0;
    if (
      input.review.expectedVersion !== undefined &&
      input.review.expectedVersion !== currentVersion
    ) {
      throw new Error(
        `Hits review version conflict. Expected ${input.review.expectedVersion}, current version is ${currentVersion}.`,
      );
    }

    const saved = await client.query<ReviewRow>(
      `
        INSERT INTO hits_reviews (
          tenant_id, package_id, hits_result_id, review_status,
          decision, comments, reviewed_by, reviewed_at, review_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, now(), 1)
        ON CONFLICT (tenant_id, package_id, hits_result_id)
        DO UPDATE SET
          review_status = EXCLUDED.review_status,
          decision = EXCLUDED.decision,
          comments = EXCLUDED.comments,
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_at = now(),
          review_version = hits_reviews.review_version + 1,
          updated_at = now()
        RETURNING *
      `,
      [
        input.principal.tenantId,
        input.review.packageId,
        input.review.hitsResultId,
        input.review.status,
        decision,
        comments,
        input.principal.userId,
      ],
    );
    await client.query(
      `
        UPDATE literature_packages
        SET status = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
      `,
      [input.review.packageId, input.principal.tenantId, workflowState],
    );
    await client.query(
      `
        UPDATE literature_workflow_state
        SET
          workflow_state = $3,
          state_version = state_version + 1,
          state_payload = state_payload || $4::jsonb,
          updated_by = $5,
          updated_at = now()
        WHERE package_id = $1 AND tenant_id = $2
      `,
      [
        input.review.packageId,
        input.principal.tenantId,
        workflowState,
        JSON.stringify({
          hitsReviewStatus: input.review.status,
          hitsReviewDecision: decision,
          hitsReviewVersion: saved.rows[0].review_version,
          hitsReviewedAt: new Date().toISOString(),
        }),
        input.principal.userId,
      ],
    );
    await client.query(
      `
        INSERT INTO audit_events (
          tenant_id, package_id, actor_id, event_type,
          event_category, outcome, details
        )
        VALUES ($1, $2, $3, 'HITS_REVIEW_SAVED',
          'LITERATURE_HITS', 'success', $4::jsonb)
      `,
      [
        input.principal.tenantId,
        input.review.packageId,
        input.principal.userId,
        JSON.stringify({
          hitsResultId: input.review.hitsResultId,
          status: input.review.status,
          decision,
          reviewVersion: saved.rows[0].review_version,
          workflowState,
          comments,
        }),
      ],
    );
    await client.query("COMMIT");

    const record = saved.rows[0];
    return {
      id: record.id,
      packageId: record.package_id,
      hitsResultId: record.hits_result_id,
      status: record.review_status,
      decision: record.decision,
      comments: record.comments || undefined,
      reviewVersion: record.review_version,
      reviewedAt: record.reviewed_at || undefined,
      reviewedBy: input.principal.displayName,
      workflowState,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
