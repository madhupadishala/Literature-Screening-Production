import "server-only";

import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { extractDocumentText } from "./document-text-extractor";
import {
  extractPvSuggestions,
  PV_EXTRACTOR_KEY,
  PV_EXTRACTOR_VERSION,
  type PvSuggestionType,
} from "./pv-suggestion-extractor";

export type SuggestionDecision = "ACCEPTED" | "REJECTED" | "EDITED";

export interface IntakeExtractionSuggestionRecord {
  id: string;
  suggestionType: PvSuggestionType;
  entityKey: string;
  suggestedPayload: Record<string, unknown>;
  confidence: number;
  evidenceText: string;
  sourceLocator: Record<string, unknown>;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EDITED" | "SUPERSEDED";
  finalPayload: Record<string, unknown> | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface IntakeWorkspace {
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  patients: Array<Record<string, unknown>>;
  reporters: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  tests: Array<Record<string, unknown>>;
  extractionRuns: Array<Record<string, unknown>>;
  suggestions: IntakeExtractionSuggestionRecord[];
}

function reason(value: string, field = "reason"): string {
  const normalized = value.trim();
  if (normalized.length < 10) {
    throw new Error(`${field} must contain at least 10 characters.`);
  }
  return normalized;
}

function objectPayload(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, field: string): string {
  const result = optionalString(value);
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function json(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback);
}

async function ensureIntake(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const selected = await client.query<Record<string, unknown>>(
    `SELECT intake.*, source.source_type, source.source_system,
            source.external_reference, source.received_at,
            source.source_payload, source.source_sha256
       FROM safety_intake_records intake
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = intake.tenant_id
      WHERE intake.tenant_id = $1
        AND intake.id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE OF intake" : ""}`,
    [tenantId, intakeRecordId],
  );
  if (!selected.rows[0]) {
    throw new Error("Safety Intake was not found in the active tenant.");
  }
  return selected.rows[0];
}

function mapSuggestion(row: Record<string, unknown>): IntakeExtractionSuggestionRecord {
  return {
    id: String(row.id),
    suggestionType: String(row.suggestion_type) as PvSuggestionType,
    entityKey: String(row.entity_key),
    suggestedPayload: objectPayload(row.suggested_payload, "suggestedPayload"),
    confidence: Number(row.confidence),
    evidenceText: String(row.evidence_text || ""),
    sourceLocator: objectPayload(row.source_locator || {}, "sourceLocator"),
    status: String(row.status) as IntakeExtractionSuggestionRecord["status"],
    finalPayload:
      row.final_payload && typeof row.final_payload === "object"
        ? (row.final_payload as Record<string, unknown>)
        : null,
    reviewReason: row.review_reason ? String(row.review_reason) : null,
    reviewedAt: row.reviewed_at
      ? new Date(String(row.reviewed_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function getIntakeWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<IntakeWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const pool = getPostgresPool();
  const verificationClient = await pool.connect();
  let intake: Record<string, unknown>;
  try {
    intake = await ensureIntake(
      verificationClient,
      input.principal.tenantId,
      intakeRecordId,
    );
  } finally {
    verificationClient.release();
  }

  // Use pool queries after tenant existence is established; every query remains tenant-scoped.
  const [
    documents,
    patients,
    reporters,
    products,
    events,
    tests,
    runs,
    suggestions,
  ] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `SELECT id, document_key, file_name, content_type, size_bytes,
              content_sha256, extraction_status, extracted_text,
              extracted_text_sha256, extracted_page_count, extracted_at,
              extraction_engine, extraction_error, created_at
         FROM safety_source_documents
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at DESC`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM safety_patients
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM safety_reporters
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY primary_source DESC, created_at`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM safety_products
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM safety_events
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM safety_tests
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT id, run_number, parser_key, parser_version, extractor_key,
              extractor_version, status, source_sha256, extracted_text_sha256,
              suggestion_count, error_message, started_at, completed_at
         FROM safety_extraction_runs
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY run_number DESC`,
      [input.principal.tenantId, intakeRecordId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT id, suggestion_type, entity_key, suggested_payload, confidence,
              evidence_text, source_locator, status, final_payload,
              review_reason, reviewed_at, created_at
         FROM safety_extraction_suggestions
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at, suggestion_type, entity_key`,
      [input.principal.tenantId, intakeRecordId],
    ),
  ]);

  const source = {
    id: intake.source_id,
    sourceType: intake.source_type,
    sourceSystem: intake.source_system,
    externalReference: intake.external_reference,
    receivedAt: intake.received_at,
    payload: intake.source_payload,
    sha256: intake.source_sha256,
  };

  return {
    intake,
    source,
    documents: documents.rows,
    patients: patients.rows,
    reporters: reporters.rows,
    products: products.rows,
    events: events.rows,
    tests: tests.rows,
    extractionRuns: runs.rows,
    suggestions: suggestions.rows.map(mapSuggestion),
  };
}

export async function runIntakeExtraction(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reason: string;
}): Promise<IntakeWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  const changeReason = reason(input.reason);

  const pool = getPostgresPool();
  const client = await pool.connect();
  let runId = "";
  let documentId = "";

  try {
    await client.query("BEGIN");
    const intake = await ensureIntake(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );
    if (String(intake.source_review_status) === "VERIFIED") {
      throw new Error(
        "Verified source review cannot be re-extracted without a controlled reopen.",
      );
    }

    const document = await client.query<{
      id: string;
      content_type: string;
      content_sha256: string;
      content_bytes: Buffer;
    }>(
      `SELECT id, content_type, content_sha256, content_bytes
         FROM safety_source_documents
        WHERE tenant_id = $1
          AND intake_record_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId],
    );

    const row = document.rows[0];
    if (!row) {
      throw new Error(
        "No source document is attached to this Intake. Structured sources are reviewed directly.",
      );
    }
    documentId = row.id;

    const nextRun = await client.query<{ next_run: number }>(
      `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run
         FROM safety_extraction_runs
        WHERE tenant_id = $1 AND intake_record_id = $2`,
      [input.principal.tenantId, intakeRecordId],
    );

    const run = await client.query<{ id: string }>(
      `INSERT INTO safety_extraction_runs (
         tenant_id, intake_record_id, document_id, run_number,
         parser_key, parser_version, extractor_key, extractor_version,
         status, source_sha256, created_by
       ) VALUES (
         $1,$2,$3,$4,'NEXUS_ZERO_COST_DOCUMENT_PARSER','1.0.0',
         $5,$6,'RUNNING',$7,$8
       )
       RETURNING id`,
      [
        input.principal.tenantId,
        intakeRecordId,
        row.id,
        Number(nextRun.rows[0].next_run),
        PV_EXTRACTOR_KEY,
        PV_EXTRACTOR_VERSION,
        row.content_sha256,
        input.principal.userId,
      ],
    );
    runId = run.rows[0].id;

    await client.query(
      `UPDATE safety_extraction_suggestions
          SET status = 'SUPERSEDED',
              reviewed_by = $3,
              review_reason = 'Superseded by a newer extraction run.',
              reviewed_at = now()
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND status = 'PENDING'`,
      [input.principal.tenantId, intakeRecordId, input.principal.userId],
    );

    await client.query(
      `UPDATE safety_source_documents
          SET extraction_status = 'IN_PROGRESS',
              extraction_error = NULL
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, row.id],
    );

    await client.query("COMMIT");

    const extracted = await extractDocumentText({
      bytes: row.content_bytes,
      contentType: row.content_type,
    });
    const suggestions = extractPvSuggestions(extracted.text);

    await client.query("BEGIN");

    await client.query(
      `UPDATE safety_source_documents
          SET extraction_status = 'COMPLETE',
              extracted_text = $3,
              extracted_text_sha256 = $4,
              extracted_page_count = $5,
              extracted_at = now(),
              extraction_engine = $6,
              extraction_error = NULL
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        row.id,
        extracted.text,
        extracted.textSha256,
        extracted.pageCount ?? null,
        `${extracted.parserKey}@${extracted.parserVersion}`,
      ],
    );

    for (const suggestion of suggestions) {
      await client.query(
        `INSERT INTO safety_extraction_suggestions (
           tenant_id, intake_record_id, extraction_run_id,
           suggestion_type, entity_key, suggested_payload, confidence,
           evidence_text, source_locator
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)`,
        [
          input.principal.tenantId,
          intakeRecordId,
          runId,
          suggestion.suggestionType,
          suggestion.entityKey,
          JSON.stringify(suggestion.suggestedPayload),
          suggestion.confidence,
          suggestion.evidenceText,
          JSON.stringify(suggestion.sourceLocator),
        ],
      );
    }

    await client.query(
      `UPDATE safety_extraction_runs
          SET status = 'COMPLETED',
              extracted_text_sha256 = $3,
              suggestion_count = $4,
              completed_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        runId,
        extracted.textSha256,
        suggestions.length,
      ],
    );

    await client.query(
      `UPDATE safety_intake_records
          SET source_review_status = 'IN_PROGRESS',
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, intakeRecordId, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_EXTRACTION_COMPLETED',
         'NEXUS_INTAKE_REVIEW','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          documentId: row.id,
          extractionRunId: runId,
          suggestionCount: suggestions.length,
          extractedTextSha256: extracted.textSha256,
          reason: changeReason,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (runId) {
      await pool
        .query(
          `UPDATE safety_extraction_runs
              SET status = 'FAILED',
                  error_message = $3,
                  completed_at = now()
            WHERE tenant_id = $1 AND id = $2`,
          [
            input.principal.tenantId,
            runId,
            error instanceof Error ? error.message : "Extraction failed.",
          ],
        )
        .catch(() => undefined);
    }
    if (documentId) {
      await pool
        .query(
          `UPDATE safety_source_documents
              SET extraction_status = 'FAILED',
                  extraction_error = $3
            WHERE tenant_id = $1 AND id = $2`,
          [
            input.principal.tenantId,
            documentId,
            error instanceof Error ? error.message : "Extraction failed.",
          ],
        )
        .catch(() => undefined);
    }
    await pool
      .query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, details
         ) VALUES ($1,$2,'INTAKE_EXTRACTION_FAILED',
           'NEXUS_INTAKE_REVIEW','failed',$3::jsonb)`,
        [
          input.principal.tenantId,
          input.principal.userId,
          JSON.stringify({
            intakeRecordId,
            extractionRunId: runId || null,
            documentId: documentId || null,
            error: error instanceof Error ? error.message : "Extraction failed.",
            reason: changeReason,
          }),
        ],
      )
      .catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return getIntakeWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}

async function upsertAcceptedPayload(input: {
  client: PoolClient;
  principal: RequestPrincipal;
  intakeRecordId: string;
  suggestionType: PvSuggestionType;
  entityKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { client, principal, intakeRecordId, suggestionType, entityKey, payload } =
    input;

  if (suggestionType === "PATIENT") {
    const sex = optionalString(payload.sex);
    if (sex && !["MALE", "FEMALE", "UNKNOWN", "NOT_SPECIFIED"].includes(sex)) {
      throw new Error("Patient sex is invalid.");
    }
    await client.query(
      `INSERT INTO safety_patients (
         tenant_id, intake_record_id, patient_key, patient_reference,
         sex, age_value, age_unit, age_group, pregnancy_status,
         medical_history, parent_information, e2b_d_payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb,'{}'::jsonb,$10::jsonb)
       ON CONFLICT (tenant_id, intake_record_id, patient_key)
       DO UPDATE SET
         patient_reference = EXCLUDED.patient_reference,
         sex = EXCLUDED.sex,
         age_value = EXCLUDED.age_value,
         age_unit = EXCLUDED.age_unit,
         age_group = EXCLUDED.age_group,
         pregnancy_status = EXCLUDED.pregnancy_status,
         e2b_d_payload = EXCLUDED.e2b_d_payload,
         updated_at = now()`,
      [
        principal.tenantId,
        intakeRecordId,
        entityKey,
        optionalString(payload.patientReference),
        sex,
        optionalNumber(payload.ageValue),
        optionalString(payload.ageUnit),
        optionalString(payload.ageGroup),
        optionalString(payload.pregnancyStatus),
        json(payload, {}),
      ],
    );
    return;
  }

  if (suggestionType === "REPORTER") {
    await client.query(
      `INSERT INTO safety_reporters (
         tenant_id, intake_record_id, reporter_key, primary_source,
         qualification, organization, country_code, reporter_payload, e2b_c2_payload
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$8::jsonb)
       ON CONFLICT (tenant_id, intake_record_id, reporter_key)
       DO UPDATE SET
         primary_source = EXCLUDED.primary_source,
         qualification = EXCLUDED.qualification,
         organization = EXCLUDED.organization,
         country_code = EXCLUDED.country_code,
         reporter_payload = EXCLUDED.reporter_payload,
         e2b_c2_payload = EXCLUDED.e2b_c2_payload`,
      [
        principal.tenantId,
        intakeRecordId,
        entityKey,
        optionalBoolean(payload.primarySource) ?? false,
        optionalString(payload.qualification),
        optionalString(payload.organization),
        optionalString(payload.countryCode),
        json(payload, {}),
      ],
    );
    return;
  }

  if (suggestionType === "PRODUCT") {
    const role =
      optionalString(payload.roleCharacterization) ?? "UNSPECIFIED";
    if (
      ![
        "SUSPECT",
        "INTERACTING",
        "CONCOMITANT",
        "DRUG_NOT_ADMINISTERED",
        "UNSPECIFIED",
      ].includes(role)
    ) {
      throw new Error("Product roleCharacterization is invalid.");
    }
    await client.query(
      `INSERT INTO safety_products (
         tenant_id, intake_record_id, product_key, reported_name,
         role_characterization, active_substances, authorization,
         indication, dosage, route, therapy_dates, rechallenge, e2b_g_payload
       ) VALUES (
         $1,$2,$3,$4,$5,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb,
         '[]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$6::jsonb
       )
       ON CONFLICT (tenant_id, intake_record_id, product_key)
       DO UPDATE SET
         reported_name = EXCLUDED.reported_name,
         role_characterization = EXCLUDED.role_characterization,
         e2b_g_payload = EXCLUDED.e2b_g_payload,
         updated_at = now()`,
      [
        principal.tenantId,
        intakeRecordId,
        entityKey,
        requiredString(payload.reportedName, "reportedName"),
        role,
        json(payload, {}),
      ],
    );
    return;
  }

  if (suggestionType === "EVENT") {
    await client.query(
      `INSERT INTO safety_events (
         tenant_id, intake_record_id, event_key, reported_term,
         seriousness, seriousness_criteria, medically_confirmed,
         country_code, e2b_e_payload
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)
       ON CONFLICT (tenant_id, intake_record_id, event_key)
       DO UPDATE SET
         reported_term = EXCLUDED.reported_term,
         seriousness = EXCLUDED.seriousness,
         seriousness_criteria = EXCLUDED.seriousness_criteria,
         medically_confirmed = EXCLUDED.medically_confirmed,
         country_code = EXCLUDED.country_code,
         e2b_e_payload = EXCLUDED.e2b_e_payload,
         updated_at = now()`,
      [
        principal.tenantId,
        intakeRecordId,
        entityKey,
        requiredString(payload.reportedTerm, "reportedTerm"),
        optionalBoolean(payload.seriousness),
        json(payload.seriousnessCriteria, {}),
        optionalBoolean(payload.medicallyConfirmed),
        optionalString(payload.countryCode),
        json(payload, {}),
      ],
    );
    return;
  }

  await client.query(
    `INSERT INTO safety_tests (
       tenant_id, intake_record_id, test_key, test_name, test_date,
       result_value, result_unit, reference_range, comments, e2b_f_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (tenant_id, intake_record_id, test_key)
     DO UPDATE SET
       test_name = EXCLUDED.test_name,
       test_date = EXCLUDED.test_date,
       result_value = EXCLUDED.result_value,
       result_unit = EXCLUDED.result_unit,
       reference_range = EXCLUDED.reference_range,
       comments = EXCLUDED.comments,
       e2b_f_payload = EXCLUDED.e2b_f_payload`,
    [
      principal.tenantId,
      intakeRecordId,
      entityKey,
      requiredString(payload.testName, "testName"),
      optionalString(payload.testDate),
      optionalString(payload.resultValue),
      optionalString(payload.resultUnit),
      optionalString(payload.referenceRange),
      optionalString(payload.comments),
      json(payload, {}),
    ],
  );
}

export async function reviewExtractionSuggestion(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  suggestionId: string;
  decision: SuggestionDecision;
  finalPayload?: Record<string, unknown>;
  reason: string;
}): Promise<IntakeWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  const suggestionId = input.suggestionId.trim();
  if (!intakeRecordId || !suggestionId) {
    throw new Error("intakeRecordId and suggestionId are required.");
  }
  const reviewReason = reason(input.reason, "reviewReason");

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const intake = await ensureIntake(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );
    if (String(intake.source_review_status) === "VERIFIED") {
      throw new Error("Verified source review cannot be modified.");
    }

    const selected = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_extraction_suggestions
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND id = $3
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId, suggestionId],
    );
    const suggestion = selected.rows[0];
    if (!suggestion) throw new Error("Extraction suggestion was not found.");
    if (String(suggestion.status) !== "PENDING") {
      throw new Error("Only pending extraction suggestions can be reviewed.");
    }

    let finalPayload: Record<string, unknown> | null = null;
    if (input.decision === "ACCEPTED") {
      finalPayload = objectPayload(
        suggestion.suggested_payload,
        "suggestedPayload",
      );
    } else if (input.decision === "EDITED") {
      finalPayload = objectPayload(input.finalPayload, "finalPayload");
    }

    if (finalPayload) {
      await upsertAcceptedPayload({
        client,
        principal: input.principal,
        intakeRecordId,
        suggestionType: String(suggestion.suggestion_type) as PvSuggestionType,
        entityKey: String(suggestion.entity_key),
        payload: finalPayload,
      });
    }

    await client.query(
      `UPDATE safety_extraction_suggestions
          SET status = $4,
              final_payload = $5::jsonb,
              reviewed_by = $6,
              review_reason = $7,
              reviewed_at = now()
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND id = $3`,
      [
        input.principal.tenantId,
        intakeRecordId,
        suggestionId,
        input.decision,
        finalPayload ? JSON.stringify(finalPayload) : null,
        input.principal.userId,
        reviewReason,
      ],
    );

    await client.query(
      `UPDATE safety_intake_records
          SET source_review_status = 'IN_PROGRESS',
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, intakeRecordId, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_EXTRACTION_SUGGESTION_REVIEWED',
         'NEXUS_INTAKE_REVIEW','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          suggestionId,
          suggestionType: suggestion.suggestion_type,
          entityKey: suggestion.entity_key,
          decision: input.decision,
          reason: reviewReason,
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

  return getIntakeWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}

export async function completeIntakeSourceReview(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  reason: string;
}): Promise<IntakeWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  const reviewReason = reason(input.reason, "reviewReason");

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const intake = await ensureIntake(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );
    if (String(intake.source_review_status) === "VERIFIED") {
      await client.query("COMMIT");
      return getIntakeWorkspace({
        principal: input.principal,
        intakeRecordId,
      });
    }

    const documentState = await client.query<{ extraction_status: string }>(
      `SELECT extraction_status
         FROM safety_source_documents
        WHERE tenant_id = $1
          AND intake_record_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.principal.tenantId, intakeRecordId],
    );
    const extractionStatus = documentState.rows[0]?.extraction_status;
    if (extractionStatus === "PENDING" || extractionStatus === "IN_PROGRESS") {
      throw new Error(
        "Document extraction must complete or fail before source review can be verified.",
      );
    }

    const pending = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM safety_extraction_suggestions suggestion
         JOIN safety_extraction_runs run
           ON run.id = suggestion.extraction_run_id
          AND run.tenant_id = suggestion.tenant_id
        WHERE suggestion.tenant_id = $1
          AND suggestion.intake_record_id = $2
          AND suggestion.status = 'PENDING'
          AND run.run_number = (
            SELECT MAX(run_number)
              FROM safety_extraction_runs
             WHERE tenant_id = $1 AND intake_record_id = $2
          )`,
      [input.principal.tenantId, intakeRecordId],
    );
    if (Number(pending.rows[0]?.count ?? 0) > 0) {
      throw new Error(
        "All current extraction suggestions must be accepted, edited, or rejected before source review can be verified.",
      );
    }

    await client.query(
      `UPDATE safety_intake_records
          SET source_review_status = 'VERIFIED',
              source_reviewed_at = now(),
              source_reviewed_by = $3,
              updated_by = $3,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, intakeRecordId, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'INTAKE_SOURCE_REVIEW_VERIFIED',
         'NEXUS_INTAKE_REVIEW','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          reason: reviewReason,
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

  return getIntakeWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}
