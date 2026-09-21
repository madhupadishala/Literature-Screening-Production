import "server-only";

import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import {
  DUPLICATE_ALGORITHM_KEY,
  DUPLICATE_ALGORITHM_VERSION,
  DUPLICATE_CANDIDATE_THRESHOLD,
  type DuplicateFingerprint,
  type DuplicateHumanDecision,
  type DuplicateMatchResult,
} from "./duplicate-types";
import { rankDuplicateCandidates } from "./duplicate-matcher";

export interface DuplicateCandidateRecord {
  id: string;
  candidateIntakeRecordId: string;
  candidateCaseId: string | null;
  candidateReference: string;
  score: number;
  confidenceBand: "LOW" | "MEDIUM" | "HIGH";
  matchedFactors: Array<Record<string, unknown>>;
  candidateSnapshot: DuplicateFingerprint;
  rank: number;
  humanCandidateDecision:
    | "PENDING"
    | "NOT_MATCH"
    | "FOLLOW_UP_MATCH"
    | "DUPLICATE_MATCH";
}

export interface DuplicateReviewRunRecord {
  id: string;
  runNumber: number;
  algorithmKey: string;
  algorithmVersion: string;
  candidateThreshold: number;
  sourceSnapshot: DuplicateFingerprint;
  sourceSnapshotSha256: string;
  candidateCount: number;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  completedAt: string | null;
}

export interface DuplicateAssessmentRecord {
  id: string;
  assessmentVersion: number;
  systemRecommendation: "NO_LIKELY_MATCH" | "POTENTIAL_MATCH";
  topCandidateScore: number | null;
  humanDecision: DuplicateHumanDecision;
  selectedCandidateId: string | null;
  selectedCandidateIntakeRecordId: string | null;
  selectedCandidateCaseId: string | null;
  selectedExternalReference: string | null;
  rationale: string;
  assessedAt: string;
}

export interface DuplicateWorkspace {
  source: DuplicateFingerprint;
  latestRun: DuplicateReviewRunRecord | null;
  candidates: DuplicateCandidateRecord[];
  latestAssessment: DuplicateAssessmentRecord | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractSourceIdentifiers(payload: unknown): string[] {
  const result = new Set<string>();
  const allowedKeys = new Set([
    "pmid",
    "doi",
    "caseid",
    "case_id",
    "globalcaseid",
    "global_case_id",
    "worldwidecaseid",
    "worldwide_case_id",
    "reportid",
    "report_id",
    "safetyreportid",
    "safety_report_id",
    "externalreference",
    "external_reference",
    "sourceid",
    "source_id",
  ]);

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (
        allowedKeys.has(normalizedKey) &&
        (typeof item === "string" || typeof item === "number")
      ) {
        const normalizedValue = String(item).trim();
        if (normalizedValue) result.add(normalizedValue);
      }
      walk(item);
    }
  }

  walk(payload);
  return Array.from(result);
}

function mapDuplicateRun(row: Record<string, unknown>): DuplicateReviewRunRecord {
  return {
    id: String(row.id),
    runNumber: Number(row.run_number),
    algorithmKey: String(row.algorithm_key),
    algorithmVersion: String(row.algorithm_version),
    candidateThreshold: Number(row.candidate_threshold),
    sourceSnapshot: object(row.source_snapshot) as unknown as DuplicateFingerprint,
    sourceSnapshotSha256: String(row.source_snapshot_sha256),
    candidateCount: Number(row.candidate_count),
    status: String(row.status) as DuplicateReviewRunRecord["status"],
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : null,
  };
}

function mapCandidate(row: Record<string, unknown>): DuplicateCandidateRecord {
  return {
    id: String(row.id),
    candidateIntakeRecordId: String(row.candidate_intake_record_id),
    candidateCaseId: row.candidate_case_id ? String(row.candidate_case_id) : null,
    candidateReference: String(row.candidate_reference),
    score: Number(row.score),
    confidenceBand: String(row.confidence_band) as DuplicateCandidateRecord["confidenceBand"],
    matchedFactors: array(row.matched_factors).filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
    ),
    candidateSnapshot: object(
      row.candidate_snapshot,
    ) as unknown as DuplicateFingerprint,
    rank: Number(row.rank),
    humanCandidateDecision: String(
      row.human_candidate_decision,
    ) as DuplicateCandidateRecord["humanCandidateDecision"],
  };
}

function mapAssessment(row: Record<string, unknown>): DuplicateAssessmentRecord {
  return {
    id: String(row.id),
    assessmentVersion: Number(row.assessment_version),
    systemRecommendation: String(
      row.system_recommendation,
    ) as DuplicateAssessmentRecord["systemRecommendation"],
    topCandidateScore:
      row.top_candidate_score === null || row.top_candidate_score === undefined
        ? null
        : Number(row.top_candidate_score),
    humanDecision: String(row.human_decision) as DuplicateHumanDecision,
    selectedCandidateId: row.selected_candidate_id
      ? String(row.selected_candidate_id)
      : null,
    selectedCandidateIntakeRecordId: row.selected_candidate_intake_record_id
      ? String(row.selected_candidate_intake_record_id)
      : null,
    selectedCandidateCaseId: row.selected_candidate_case_id
      ? String(row.selected_candidate_case_id)
      : null,
    selectedExternalReference: row.selected_external_reference
      ? String(row.selected_external_reference)
      : null,
    rationale: String(row.rationale),
    assessedAt: new Date(String(row.assessed_at)).toISOString(),
  };
}

async function ensureDuplicateEligible(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT *
       FROM safety_intake_records
      WHERE tenant_id = $1
        AND id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [tenantId, intakeRecordId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Safety Intake was not found in the active tenant.");
  if (String(row.triage_status) !== "COMPLETE") {
    throw new Error("Formal ICSR triage must be COMPLETE before duplicate review.");
  }
  if (String(row.validity_status) !== "VALID") {
    throw new Error("Only a VALID ICSR can enter duplicate/follow-up review.");
  }
  if (String(row.triage_outcome) !== "READY_FOR_DUPLICATE_REVIEW") {
    throw new Error(
      "The Intake triage outcome is not READY_FOR_DUPLICATE_REVIEW.",
    );
  }
  return row;
}

async function loadFingerprints(
  client: PoolClient,
  tenantId: string,
  intakeRecordIds: string[],
): Promise<DuplicateFingerprint[]> {
  if (!intakeRecordIds.length) return [];

  const base = await client.query<Record<string, unknown>>(
    `SELECT intake.id, intake.intake_key, intake.source_record_key,
            intake.country_code, intake.initial_receipt_date::text,
            intake.latest_receipt_date::text,
            source.source_type, source.external_reference, source.source_payload,
            safety_case.id AS case_id, safety_case.case_key
       FROM safety_intake_records intake
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = intake.tenant_id
       LEFT JOIN safety_cases safety_case
         ON safety_case.tenant_id = intake.tenant_id
        AND safety_case.intake_record_id = intake.id
      WHERE intake.tenant_id = $1
        AND intake.id = ANY($2::uuid[])`,
    [tenantId, intakeRecordIds],
  );

  const [patients, reporters, products, events] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT intake_record_id, patient_reference, sex, date_of_birth::text,
              age_value, age_unit
         FROM safety_patients
        WHERE tenant_id = $1
          AND intake_record_id = ANY($2::uuid[])`,
      [tenantId, intakeRecordIds],
    ),
    client.query<Record<string, unknown>>(
      `SELECT intake_record_id, qualification, organization, country_code
         FROM safety_reporters
        WHERE tenant_id = $1
          AND intake_record_id = ANY($2::uuid[])`,
      [tenantId, intakeRecordIds],
    ),
    client.query<Record<string, unknown>>(
      `SELECT intake_record_id, reported_name, role_characterization
         FROM safety_products
        WHERE tenant_id = $1
          AND intake_record_id = ANY($2::uuid[])`,
      [tenantId, intakeRecordIds],
    ),
    client.query<Record<string, unknown>>(
      `SELECT intake_record_id, reported_term, onset_date::text
         FROM safety_events
        WHERE tenant_id = $1
          AND intake_record_id = ANY($2::uuid[])`,
      [tenantId, intakeRecordIds],
    ),
  ]);

  const byIntake = <T extends Record<string, unknown>>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = String(row.intake_record_id);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };

  const patientMap = byIntake(patients.rows);
  const reporterMap = byIntake(reporters.rows);
  const productMap = byIntake(products.rows);
  const eventMap = byIntake(events.rows);

  return base.rows.map((row) => {
    const id = String(row.id);
    const sourcePayload = object(row.source_payload);
    return {
      intakeRecordId: id,
      intakeKey: String(row.intake_key),
      caseId: row.case_id ? String(row.case_id) : null,
      caseKey: row.case_key ? String(row.case_key) : null,
      externalReference: text(row.external_reference),
      sourceRecordKey: text(row.source_record_key),
      sourceType: text(row.source_type),
      countryCode: text(row.country_code),
      initialReceiptDate: text(row.initial_receipt_date),
      latestReceiptDate: text(row.latest_receipt_date),
      sourceIdentifiers: extractSourceIdentifiers(sourcePayload),
      patients: (patientMap.get(id) ?? []).map((item) => ({
        patientReference: text(item.patient_reference),
        sex: text(item.sex),
        dateOfBirth: text(item.date_of_birth),
        ageValue: numberValue(item.age_value),
        ageUnit: text(item.age_unit),
      })),
      reporters: (reporterMap.get(id) ?? []).map((item) => ({
        qualification: text(item.qualification),
        organization: text(item.organization),
        countryCode: text(item.country_code),
      })),
      products: (productMap.get(id) ?? []).map((item) => ({
        reportedName: text(item.reported_name) ?? "",
        roleCharacterization: text(item.role_characterization),
      })),
      events: (eventMap.get(id) ?? []).map((item) => ({
        reportedTerm: text(item.reported_term) ?? "",
        onsetDate: text(item.onset_date),
      })),
    };
  });
}

async function loadCandidatePool(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
): Promise<DuplicateFingerprint[]> {
  const candidates = await client.query<{ id: string }>(
    `SELECT intake.id
       FROM safety_intake_records intake
      WHERE intake.tenant_id = $1
        AND intake.id <> $2
        AND intake.triage_status = 'COMPLETE'
        AND intake.validity_status = 'VALID'
        AND COALESCE(intake.case_relationship, 'NEW_CASE') <> 'DUPLICATE'
        AND COALESCE(intake.disposition_type, 'HOLD') NOT IN ('DUPLICATE', 'NON_CASE')
      ORDER BY intake.updated_at DESC
      LIMIT 500`,
    [tenantId, intakeRecordId],
  );

  return loadFingerprints(
    client,
    tenantId,
    candidates.rows.map((item) => item.id),
  );
}

function systemRecommendation(
  candidates: DuplicateMatchResult[],
): "NO_LIKELY_MATCH" | "POTENTIAL_MATCH" {
  return (candidates[0]?.score ?? 0) >= 50
    ? "POTENTIAL_MATCH"
    : "NO_LIKELY_MATCH";
}

export async function getDuplicateWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<DuplicateWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const client = await getPostgresPool().connect();
  try {
    await ensureDuplicateEligible(
      client,
      input.principal.tenantId,
      intakeRecordId,
    );
    const source = (
      await loadFingerprints(client, input.principal.tenantId, [intakeRecordId])
    )[0];
    if (!source) throw new Error("Duplicate source fingerprint could not be built.");

    const runResult = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_duplicate_review_runs
        WHERE tenant_id = $1
          AND intake_record_id = $2
        ORDER BY run_number DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    );

    const latestRun = runResult.rows[0]
      ? mapDuplicateRun(runResult.rows[0])
      : null;

    const candidateResult = latestRun
      ? await client.query<Record<string, unknown>>(
          `SELECT *
             FROM safety_duplicate_candidates
            WHERE tenant_id = $1
              AND intake_record_id = $2
              AND review_run_id = $3
            ORDER BY rank`,
          [input.principal.tenantId, intakeRecordId, latestRun.id],
        )
      : { rows: [] as Record<string, unknown>[] };

    const assessmentResult = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_duplicate_assessments
        WHERE tenant_id = $1
          AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    );

    return {
      source,
      latestRun,
      candidates: candidateResult.rows.map(mapCandidate),
      latestAssessment: assessmentResult.rows[0]
        ? mapAssessment(assessmentResult.rows[0])
        : null,
    };
  } finally {
    client.release();
  }
}

export async function runDuplicateSearch(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reason: string;
}): Promise<DuplicateWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  const reason = input.reason.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  if (reason.length < 10) {
    throw new Error("Duplicate-search reason must contain at least 10 characters.");
  }

  const pool = getPostgresPool();
  const client = await pool.connect();
  let runId = "";

  try {
    await client.query("BEGIN");
    const intake = await ensureDuplicateEligible(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );
    if (String(intake.duplicate_review_status) === "COMPLETE") {
      throw new Error(
        "Completed duplicate review requires a controlled reopen before rerunning.",
      );
    }

    const source = (
      await loadFingerprints(client, input.principal.tenantId, [intakeRecordId])
    )[0];
    if (!source) throw new Error("Duplicate source fingerprint could not be built.");

    const nextRun = await client.query<{ next_run: number }>(
      `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run
         FROM safety_duplicate_review_runs
        WHERE tenant_id = $1
          AND intake_record_id = $2`,
      [input.principal.tenantId, intakeRecordId],
    );

    const insertedRun = await client.query<{ id: string }>(
      `INSERT INTO safety_duplicate_review_runs (
         tenant_id, intake_record_id, run_number, algorithm_key,
         algorithm_version, candidate_threshold, source_snapshot,
         source_snapshot_sha256, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'RUNNING',$9)
       RETURNING id`,
      [
        input.principal.tenantId,
        intakeRecordId,
        Number(nextRun.rows[0].next_run),
        DUPLICATE_ALGORITHM_KEY,
        DUPLICATE_ALGORITHM_VERSION,
        DUPLICATE_CANDIDATE_THRESHOLD,
        JSON.stringify(source),
        canonicalSha256(source),
        input.principal.userId,
      ],
    );
    runId = insertedRun.rows[0].id;

    const poolCandidates = await loadCandidatePool(
      client,
      input.principal.tenantId,
      intakeRecordId,
    );
    const candidates = rankDuplicateCandidates(source, poolCandidates, {
      threshold: DUPLICATE_CANDIDATE_THRESHOLD,
      limit: 10,
    });

    for (const [index, result] of candidates.entries()) {
      await client.query(
        `INSERT INTO safety_duplicate_candidates (
           tenant_id, intake_record_id, review_run_id,
           candidate_intake_record_id, candidate_case_id,
           candidate_reference, score, confidence_band, matched_factors,
           candidate_snapshot, rank
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11
         )`,
        [
          input.principal.tenantId,
          intakeRecordId,
          runId,
          result.candidate.intakeRecordId,
          result.candidate.caseId ?? null,
          result.candidate.caseKey ?? result.candidate.intakeKey,
          result.score,
          result.confidenceBand,
          JSON.stringify(result.matchedFactors),
          JSON.stringify(result.candidate),
          index + 1,
        ],
      );
    }

    await client.query(
      `UPDATE safety_duplicate_review_runs
          SET status = 'COMPLETED',
              candidate_count = $3,
              completed_at = now()
        WHERE tenant_id = $1
          AND id = $2`,
      [input.principal.tenantId, runId, candidates.length],
    );

    await client.query(
      `UPDATE safety_intake_records
          SET duplicate_review_status = 'IN_PROGRESS',
              duplicate_status = $3,
              updated_by = $4,
              updated_at = now()
        WHERE tenant_id = $1
          AND id = $2`,
      [
        input.principal.tenantId,
        intakeRecordId,
        systemRecommendation(candidates) === "POTENTIAL_MATCH"
          ? "POTENTIAL_DUPLICATE"
          : "UNASSESSED",
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO safety_review_tasks (
         tenant_id, task_key, entity_type, entity_id, task_type,
         status, created_by
       ) VALUES (
         $1,$2,'INTAKE_RECORD',$3,'DUPLICATE_REVIEW','OPEN',$4
       )
       ON CONFLICT (tenant_id, task_key)
       DO NOTHING`,
      [
        input.principal.tenantId,
        `duplicate-review:${intakeRecordId}`,
        intakeRecordId,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'DUPLICATE_SEARCH_COMPLETED',
         'NEXUS_DUPLICATE_REVIEW','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          reviewRunId: runId,
          candidateCount: candidates.length,
          topCandidateScore: candidates[0]?.score ?? null,
          systemRecommendation: systemRecommendation(candidates),
          algorithmKey: DUPLICATE_ALGORITHM_KEY,
          algorithmVersion: DUPLICATE_ALGORITHM_VERSION,
          reason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (runId) {
      await pool
        .query(
          `UPDATE safety_duplicate_review_runs
              SET status = 'FAILED',
                  error_message = $3,
                  completed_at = now()
            WHERE tenant_id = $1
              AND id = $2`,
          [
            input.principal.tenantId,
            runId,
            error instanceof Error ? error.message : "Duplicate search failed.",
          ],
        )
        .catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }

  return getDuplicateWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}

export async function finalizeDuplicateReview(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  humanDecision: DuplicateHumanDecision;
  selectedCandidateId?: string | null;
  rationale: string;
}): Promise<DuplicateWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  const rationale = input.rationale.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  if (
    !["NEW_CASE", "FOLLOW_UP", "DUPLICATE", "NOT_MATCH"].includes(
      input.humanDecision,
    )
  ) {
    throw new Error("A valid duplicate/follow-up human decision is required.");
  }
  if (rationale.length < 10) {
    throw new Error("Duplicate-review rationale must contain at least 10 characters.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const intake = await ensureDuplicateEligible(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );
    if (String(intake.duplicate_review_status) === "COMPLETE") {
      throw new Error("Duplicate/follow-up review is already complete.");
    }

    const runResult = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_duplicate_review_runs
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND status = 'COMPLETED'
        ORDER BY run_number DESC
        LIMIT 1
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId],
    );
    const run = runResult.rows[0];
    if (!run) {
      throw new Error("Run duplicate search before finalizing duplicate review.");
    }

    const candidates = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_duplicate_candidates
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND review_run_id = $3
        ORDER BY rank
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId, String(run.id)],
    );

    let selected: Record<string, unknown> | null = null;
    if (input.humanDecision === "FOLLOW_UP" || input.humanDecision === "DUPLICATE") {
      const selectedCandidateId = input.selectedCandidateId?.trim();
      if (!selectedCandidateId) {
        throw new Error(
          "A selected candidate is required for FOLLOW_UP or DUPLICATE.",
        );
      }
      selected =
        candidates.rows.find((item) => String(item.id) === selectedCandidateId) ??
        null;
      if (!selected) {
        throw new Error("Selected duplicate candidate does not belong to the latest run.");
      }
    }

    const selectedId = selected ? String(selected.id) : null;
    for (const candidate of candidates.rows) {
      const isSelected = selectedId && String(candidate.id) === selectedId;
      const candidateDecision = isSelected
        ? input.humanDecision === "FOLLOW_UP"
          ? "FOLLOW_UP_MATCH"
          : "DUPLICATE_MATCH"
        : "NOT_MATCH";

      await client.query(
        `UPDATE safety_duplicate_candidates
            SET human_candidate_decision = $4,
                reviewed_by = $5,
                review_reason = $6,
                reviewed_at = now()
          WHERE tenant_id = $1
            AND intake_record_id = $2
            AND id = $3`,
        [
          input.principal.tenantId,
          intakeRecordId,
          String(candidate.id),
          candidateDecision,
          input.principal.userId,
          isSelected
            ? rationale
            : "Not selected by the final duplicate/follow-up assessment.",
        ],
      );
    }

    const topScore =
      candidates.rows.length > 0 ? Number(candidates.rows[0].score) : null;
    const recommendation =
      topScore !== null && topScore >= 50
        ? "POTENTIAL_MATCH"
        : "NO_LIKELY_MATCH";

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(assessment_version), 0) + 1 AS next_version
         FROM safety_duplicate_assessments
        WHERE tenant_id = $1
          AND intake_record_id = $2`,
      [input.principal.tenantId, intakeRecordId],
    );

    const selectedSnapshot = selected ? object(selected.candidate_snapshot) : {};
    const assessment = await client.query<Record<string, unknown>>(
      `INSERT INTO safety_duplicate_assessments (
         tenant_id, intake_record_id, review_run_id, assessment_version,
         system_recommendation, top_candidate_score, human_decision,
         selected_candidate_id, selected_candidate_intake_record_id,
         selected_candidate_case_id, selected_external_reference,
         rationale, assessed_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
       )
       RETURNING *`,
      [
        input.principal.tenantId,
        intakeRecordId,
        String(run.id),
        Number(nextVersion.rows[0].next_version),
        recommendation,
        topScore,
        input.humanDecision,
        selectedId,
        selected ? String(selected.candidate_intake_record_id) : null,
        selected?.candidate_case_id ? String(selected.candidate_case_id) : null,
        text(selectedSnapshot.externalReference),
        rationale,
        input.principal.userId,
      ],
    );

    const duplicateStatus =
      input.humanDecision === "DUPLICATE"
        ? "CONFIRMED_DUPLICATE"
        : "UNIQUE";

    await client.query(
      `UPDATE safety_intake_records
          SET duplicate_review_status = 'COMPLETE',
              duplicate_status = $3,
              case_relationship = $4,
              matched_case_id = $5,
              matched_intake_record_id = $6,
              matched_external_reference = $7,
              duplicate_reviewed_at = now(),
              duplicate_reviewed_by = $8,
              status = 'READY_FOR_DISPOSITION',
              updated_by = $8,
              updated_at = now()
        WHERE tenant_id = $1
          AND id = $2`,
      [
        input.principal.tenantId,
        intakeRecordId,
        duplicateStatus,
        input.humanDecision,
        selected?.candidate_case_id ? String(selected.candidate_case_id) : null,
        selected ? String(selected.candidate_intake_record_id) : null,
        text(selectedSnapshot.externalReference),
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_review_tasks
          SET status = 'COMPLETED',
              completed_at = now(),
              outcome = $3::jsonb,
              updated_at = now()
        WHERE tenant_id = $1
          AND entity_type = 'INTAKE_RECORD'
          AND entity_id = $2
          AND task_type = 'DUPLICATE_REVIEW'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [
        input.principal.tenantId,
        intakeRecordId,
        JSON.stringify({
          assessmentId: assessment.rows[0].id,
          humanDecision: input.humanDecision,
          selectedCandidateId: selectedId,
          topCandidateScore: topScore,
          systemRecommendation: recommendation,
        }),
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'DUPLICATE_REVIEW_FINALIZED',
         'NEXUS_DUPLICATE_REVIEW','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          assessmentId: assessment.rows[0].id,
          reviewRunId: run.id,
          systemRecommendation: recommendation,
          topCandidateScore: topScore,
          humanDecision: input.humanDecision,
          selectedCandidateId: selectedId,
          rationale,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getDuplicateWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}
