import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";

export interface PersistedDuplicateAssessment {
  id: string;
  candidateResultId: string;
  canonicalPackageId?: string;
  canonicalPackageKey?: string;
  sourceKey: string;
  sourceRecordId: string;
  title: string;
  classification: "unique" | "duplicate" | "possible_duplicate";
  confidence: number;
  matchSignals: string[];
  assessedBy: string;
  assessedAt: string;
}

export interface DuplicateIntelligenceStatus {
  totalAssessments: number;
  uniqueRecords: number;
  duplicateRecords: number;
  possibleDuplicateRecords: number;
  mergedSourceRecords: number;
  lastAssessmentAt?: string;
}

interface AssessmentRow {
  id: string;
  candidate_result_id: string;
  canonical_package_id: string | null;
  package_key: string | null;
  source_key: string;
  source_record_id: string;
  title: string;
  classification: PersistedDuplicateAssessment["classification"];
  confidence: string | number;
  match_signals: unknown;
  assessed_by: string;
  assessed_at: string;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapAssessment(row: AssessmentRow): PersistedDuplicateAssessment {
  return {
    id: row.id,
    candidateResultId: row.candidate_result_id,
    canonicalPackageId: row.canonical_package_id || undefined,
    canonicalPackageKey: row.package_key || undefined,
    sourceKey: row.source_key,
    sourceRecordId: row.source_record_id,
    title: row.title,
    classification: row.classification,
    confidence: Number(row.confidence),
    matchSignals: stringArray(row.match_signals),
    assessedBy: row.assessed_by,
    assessedAt: row.assessed_at,
  };
}

export async function listDuplicateAssessments(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<PersistedDuplicateAssessment[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const result = await getPostgresPool().query<AssessmentRow>(
    `
      SELECT
        assessment.id,
        assessment.candidate_result_id,
        assessment.canonical_package_id,
        package.package_key,
        result.source_key,
        result.source_record_id,
        result.title,
        assessment.classification,
        assessment.confidence,
        assessment.match_signals,
        assessment.assessed_by,
        assessment.assessed_at
      FROM duplicate_assessments assessment
      JOIN ad_hoc_literature_results result
        ON result.id = assessment.candidate_result_id
       AND result.tenant_id = assessment.tenant_id
      LEFT JOIN literature_packages package
        ON package.id = assessment.canonical_package_id
       AND package.tenant_id = assessment.tenant_id
      WHERE assessment.tenant_id = $1
      ORDER BY assessment.assessed_at DESC
      LIMIT $2
    `,
    [input.principal.tenantId, limit],
  );

  return result.rows.map(mapAssessment);
}

export async function getDuplicateIntelligenceStatus(
  principal: RequestPrincipal,
): Promise<DuplicateIntelligenceStatus> {
  const result = await getPostgresPool().query<{
    total_assessments: string;
    unique_records: string;
    duplicate_records: string;
    possible_duplicate_records: string;
    merged_source_records: string;
    last_assessment_at: string | null;
  }>(
    `
      SELECT
        count(*) AS total_assessments,
        count(*) FILTER (WHERE classification = 'unique') AS unique_records,
        count(*) FILTER (WHERE classification = 'duplicate') AS duplicate_records,
        count(*) FILTER (WHERE classification = 'possible_duplicate')
          AS possible_duplicate_records,
        count(*) FILTER (
          WHERE classification = 'duplicate' AND canonical_package_id IS NOT NULL
        ) AS merged_source_records,
        max(assessed_at) AS last_assessment_at
      FROM duplicate_assessments
      WHERE tenant_id = $1
    `,
    [principal.tenantId],
  );
  const row = result.rows[0];

  return {
    totalAssessments: Number(row.total_assessments),
    uniqueRecords: Number(row.unique_records),
    duplicateRecords: Number(row.duplicate_records),
    possibleDuplicateRecords: Number(row.possible_duplicate_records),
    mergedSourceRecords: Number(row.merged_source_records),
    lastAssessmentAt: row.last_assessment_at || undefined,
  };
}
