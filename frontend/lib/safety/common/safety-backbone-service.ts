import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { literatureIntakeToSafetyDraft } from "./literature-intake-adapter";
import type {
  IntakeDraft,
  SafetyEventDraft,
  SafetyPatientDraft,
  SafetyProductDraft,
  SafetyReporterDraft,
  SafetyTestDraft,
} from "./safety-types";

interface LiteratureExportRow {
  id: string;
  package_id: string;
  export_version: number;
  payload: Record<string, unknown>;
  sha256: string;
  generated_at: string;
  safety_intake_record_id: string | null;
}

export interface SafetyIntakeSummary {
  intakeRecordId: string;
  intakeKey: string;
  sourceId: string;
  sourceType: string;
  status: string;
  validityStatus: string;
  duplicateStatus: string;
  seriousnessStatus: string;
  sourceRecordKey: string;
  createdAt: string;
  updatedAt: string;
  reused: boolean;
}

function requireReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 10) {
    throw new Error("An intake import reason of at least 10 characters is required.");
  }
  return normalized;
}

function summary(row: Record<string, unknown>, reused: boolean): SafetyIntakeSummary {
  return {
    intakeRecordId: String(row.id),
    intakeKey: String(row.intake_key),
    sourceId: String(row.source_id),
    sourceType: String(row.source_type),
    status: String(row.status),
    validityStatus: String(row.validity_status),
    duplicateStatus: String(row.duplicate_status),
    seriousnessStatus: String(row.seriousness_status),
    sourceRecordKey: String(row.source_record_key),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    reused,
  };
}

async function fetchSummary(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  reused: boolean,
): Promise<SafetyIntakeSummary> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT intake.*, source.source_type
       FROM safety_intake_records intake
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = intake.tenant_id
      WHERE intake.tenant_id = $1
        AND intake.id = $2
      LIMIT 1`,
    [tenantId, intakeRecordId],
  );

  if (!result.rows[0]) {
    throw new Error("Safety intake record was not found in the active tenant.");
  }

  return summary(result.rows[0], reused);
}

async function insertPatient(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  patient: SafetyPatientDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_patients (
       tenant_id, intake_record_id, patient_key, patient_reference, sex,
       age_value, age_unit, age_group, date_of_birth, death_date,
       weight_kg, height_cm, pregnancy_status, medical_history,
       parent_information, e2b_d_payload
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb
     )`,
    [
      tenantId,
      intakeRecordId,
      patient.patientKey,
      patient.patientReference ?? null,
      patient.sex ?? null,
      patient.ageValue ?? null,
      patient.ageUnit ?? null,
      patient.ageGroup ?? null,
      patient.dateOfBirth ?? null,
      patient.deathDate ?? null,
      patient.weightKg ?? null,
      patient.heightCm ?? null,
      patient.pregnancyStatus ?? null,
      JSON.stringify(patient.medicalHistory ?? []),
      JSON.stringify(patient.parentInformation ?? {}),
      JSON.stringify(patient.e2bD ?? {}),
    ],
  );
}

async function insertReporter(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  reporter: SafetyReporterDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_reporters (
       tenant_id, intake_record_id, reporter_key, primary_source,
       qualification, organization, country_code, reporter_payload, e2b_c2_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
    [
      tenantId,
      intakeRecordId,
      reporter.reporterKey,
      reporter.primarySource,
      reporter.qualification ?? null,
      reporter.organization ?? null,
      reporter.countryCode ?? null,
      JSON.stringify(reporter.reporterPayload ?? {}),
      JSON.stringify(reporter.e2bC2 ?? {}),
    ],
  );
}

async function insertProduct(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  product: SafetyProductDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_products (
       tenant_id, intake_record_id, product_key, reported_name,
       role_characterization, active_substances, authorization, indication,
       dosage, route, therapy_dates, batch_lot_number, action_taken,
       rechallenge, e2b_g_payload
     ) VALUES (
       $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,
       $10::jsonb,$11::jsonb,$12,$13,$14::jsonb,$15::jsonb
     )`,
    [
      tenantId,
      intakeRecordId,
      product.productKey,
      product.reportedName,
      product.roleCharacterization,
      JSON.stringify(product.activeSubstances ?? []),
      JSON.stringify(product.authorization ?? {}),
      JSON.stringify(product.indication ?? {}),
      JSON.stringify(product.dosage ?? []),
      JSON.stringify(product.route ?? {}),
      JSON.stringify(product.therapyDates ?? {}),
      product.batchLotNumber ?? null,
      product.actionTaken ?? null,
      JSON.stringify(product.rechallenge ?? {}),
      JSON.stringify(product.e2bG ?? {}),
    ],
  );
}

async function insertEvent(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  event: SafetyEventDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_events (
       tenant_id, intake_record_id, event_key, reported_term,
       meddra_term, meddra_code, meddra_version, onset_date, end_date,
       outcome, seriousness, seriousness_criteria, medically_confirmed,
       country_code, e2b_e_payload
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb
     )`,
    [
      tenantId,
      intakeRecordId,
      event.eventKey,
      event.reportedTerm,
      event.meddraTerm ?? null,
      event.meddraCode ?? null,
      event.meddraVersion ?? null,
      event.onsetDate ?? null,
      event.endDate ?? null,
      event.outcome ?? null,
      event.seriousness ?? null,
      JSON.stringify(event.seriousnessCriteria ?? {}),
      event.medicallyConfirmed ?? null,
      event.countryCode ?? null,
      JSON.stringify(event.e2bE ?? {}),
    ],
  );
}

async function insertTest(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  test: SafetyTestDraft,
): Promise<void> {
  await client.query(
    `INSERT INTO safety_tests (
       tenant_id, intake_record_id, test_key, test_name, test_date,
       result_value, result_unit, reference_range, comments, e2b_f_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      tenantId,
      intakeRecordId,
      test.testKey,
      test.testName,
      test.testDate ?? null,
      test.resultValue ?? null,
      test.resultUnit ?? null,
      test.referenceRange ?? null,
      test.comments ?? null,
      JSON.stringify(test.e2bF ?? {}),
    ],
  );
}

async function persistDraft(input: {
  client: PoolClient;
  principal: RequestPrincipal;
  draft: IntakeDraft;
  reason: string;
}): Promise<SafetyIntakeSummary> {
  const sourceId = randomUUID();
  const source = await input.client.query<{ id: string }>(
    `INSERT INTO safety_sources (
       id, tenant_id, source_key, source_type, source_system,
       external_reference, received_at, country_code, language_code,
       source_payload, source_sha256, status, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'NORMALIZED',$12
     )
     ON CONFLICT (tenant_id, source_key)
     DO UPDATE SET
       status = 'NORMALIZED',
       updated_at = now()
     RETURNING id`,
    [
      sourceId,
      input.principal.tenantId,
      input.draft.source.sourceKey,
      input.draft.source.sourceType,
      input.draft.source.sourceSystem,
      input.draft.source.externalReference ?? null,
      input.draft.source.receivedAt,
      input.draft.source.countryCode ?? null,
      input.draft.source.languageCode ?? null,
      JSON.stringify(input.draft.source.sourcePayload),
      input.draft.source.sourceSha256,
      input.principal.userId,
    ],
  );

  const persistedSourceId = source.rows[0].id;
  const intakeId = randomUUID();
  const intake = await input.client.query<{ id: string }>(
    `INSERT INTO safety_intake_records (
       id, tenant_id, intake_key, source_id, source_record_key,
       intake_channel, status, initial_receipt_date, latest_receipt_date,
       country_code, language_code, intake_payload, source_lineage,
       source_lineage_sha256, created_by, updated_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$15
     )
     ON CONFLICT (tenant_id, source_id, source_record_key)
     DO UPDATE SET updated_at = safety_intake_records.updated_at
     RETURNING id`,
    [
      intakeId,
      input.principal.tenantId,
      input.draft.intake.intakeKey,
      persistedSourceId,
      input.draft.intake.sourceRecordKey,
      input.draft.intake.intakeChannel,
      input.draft.intake.status,
      input.draft.intake.initialReceiptDate ?? null,
      input.draft.intake.latestReceiptDate ?? null,
      input.draft.intake.countryCode ?? null,
      input.draft.intake.languageCode ?? null,
      JSON.stringify(input.draft.intake.payload),
      JSON.stringify(input.draft.intake.lineage),
      input.draft.intake.lineageSha256,
      input.principal.userId,
    ],
  );

  const persistedIntakeId = intake.rows[0].id;
  const newlyCreated = persistedIntakeId === intakeId;

  if (newlyCreated) {
    for (const patient of input.draft.patients) {
      await insertPatient(input.client, input.principal.tenantId, persistedIntakeId, patient);
    }
    for (const reporter of input.draft.reporters) {
      await insertReporter(input.client, input.principal.tenantId, persistedIntakeId, reporter);
    }
    for (const product of input.draft.products) {
      await insertProduct(input.client, input.principal.tenantId, persistedIntakeId, product);
    }
    for (const event of input.draft.events) {
      await insertEvent(input.client, input.principal.tenantId, persistedIntakeId, event);
    }
    for (const test of input.draft.tests) {
      await insertTest(input.client, input.principal.tenantId, persistedIntakeId, test);
    }

    await input.client.query(
      `INSERT INTO safety_review_tasks (
         tenant_id, task_key, entity_type, entity_id, task_type,
         status, created_by
       ) VALUES ($1,$2,'INTAKE_RECORD',$3,'TRIAGE','OPEN',$4)`,
      [
        input.principal.tenantId,
        "triage:" + persistedIntakeId,
        persistedIntakeId,
        input.principal.userId,
      ],
    );

    await input.client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES ($1,$2,'SAFETY_INTAKE_CREATED','NEXUS_SAFETY_INTAKE','success',$3::jsonb)`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId: persistedIntakeId,
          intakeKey: input.draft.intake.intakeKey,
          sourceId: persistedSourceId,
          sourceType: input.draft.source.sourceType,
          sourceRecordKey: input.draft.intake.sourceRecordKey,
          lineageSha256: input.draft.intake.lineageSha256,
          reason: input.reason,
        }),
      ],
    );
  }

  return fetchSummary(
    input.client,
    input.principal.tenantId,
    persistedIntakeId,
    !newlyCreated,
  );
}

export async function importLiteratureIntakeExport(input: {
  principal: RequestPrincipal;
  exportId: string;
  reason: string;
}): Promise<SafetyIntakeSummary> {
  const exportId = input.exportId.trim();
  if (!exportId) throw new Error("exportId is required.");
  const reason = requireReason(input.reason);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const selected = await client.query<LiteratureExportRow>(
      `SELECT id, package_id, export_version, payload, sha256,
              generated_at::text, safety_intake_record_id
         FROM intake_input_exports
        WHERE tenant_id = $1
          AND id = $2
        FOR UPDATE`,
      [input.principal.tenantId, exportId],
    );

    const row = selected.rows[0];
    if (!row) {
      throw new Error("Literature Intake export was not found in the active tenant.");
    }

    if (row.safety_intake_record_id) {
      const existing = await fetchSummary(
        client,
        input.principal.tenantId,
        row.safety_intake_record_id,
        true,
      );
      await client.query("COMMIT");
      return existing;
    }

    const draft = literatureIntakeToSafetyDraft({
      exportId: row.id,
      exportVersion: Number(row.export_version),
      exportSha256: row.sha256,
      generatedAt: row.generated_at,
      payload: row.payload,
    });

    const persisted = await persistDraft({
      client,
      principal: input.principal,
      draft,
      reason,
    });

    await client.query(
      `UPDATE intake_input_exports
          SET safety_intake_record_id = $3
        WHERE tenant_id = $1
          AND id = $2`,
      [input.principal.tenantId, exportId, persisted.intakeRecordId],
    );

    await client.query(
      `INSERT INTO safety_evidence_links (
         tenant_id, source_id, intake_record_id, link_type,
         source_locator, evidence_sha256, metadata, created_by
       )
       SELECT $1, intake.source_id, intake.id, 'LITERATURE_INTAKE_EXPORT',
              $3::jsonb, $4, $5::jsonb, $6
         FROM safety_intake_records intake
        WHERE intake.tenant_id = $1
          AND intake.id = $2`,
      [
        input.principal.tenantId,
        persisted.intakeRecordId,
        JSON.stringify({
          exportId: row.id,
          packageId: row.package_id,
          exportVersion: Number(row.export_version),
        }),
        row.sha256,
        JSON.stringify({
          sourceSystem: "CLINIXAI_LITERATURE_INTELLIGENCE",
          immutableUpstreamExport: true,
        }),
        input.principal.userId,
      ],
    );

    await client.query("COMMIT");
    return persisted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSafetyIntakes(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<SafetyIntakeSummary[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT intake.*, source.source_type
       FROM safety_intake_records intake
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = intake.tenant_id
      WHERE intake.tenant_id = $1
      ORDER BY intake.updated_at DESC
      LIMIT $2`,
    [input.principal.tenantId, limit],
  );

  return result.rows.map((row) => summary(row, true));
}
