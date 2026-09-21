import "server-only";

import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import {
  CASE_ASSESSMENT_TYPES,
  CASE_NARRATIVE_STAGES,
  type CaseAssessmentType,
  type CaseDraftPayload,
  type CaseNarrativeStage,
} from "./case-processing-types";
import {
  deterministicNarrativeDraft,
  evaluateCaseAssist,
} from "./case-assist";

export interface CaseWorklistRow {
  caseId: string;
  caseKey: string;
  intakeRecordId: string;
  caseStatus: string;
  priority: string;
  seriousnessStatus: string;
  assignedTo: string | null;
  currentDraftRevision: number;
  currentVersion: number;
  initialReceiptDate: string;
  latestReceiptDate: string;
  updatedAt: string;
}

export interface CaseDraftRecord {
  id: string;
  revision: number;
  payload: CaseDraftPayload;
  draftSha256: string;
  sourceKind: string;
  changeReason: string;
  createdAt: string;
}

export interface CaseAssessmentRecord {
  id: string;
  productKey: string;
  eventKey: string;
  assessmentType: CaseAssessmentType;
  result: string;
  rationale: string;
  evidence: Record<string, unknown>;
  assessmentVersion: number;
  assessedAt: string;
}

export interface CaseNarrativeRecord {
  id: string;
  narrativeVersion: number;
  narrativeStage: CaseNarrativeStage;
  narrativeText: string;
  sourceRevision: number | null;
  changeReason: string;
  narrativeSha256: string;
  createdAt: string;
}

export interface CaseAssistRecord {
  id: string;
  draftRevision: number;
  suggestionType: string;
  payload: Record<string, unknown>;
  confidence: number;
  evidence: Record<string, unknown>;
  status: string;
  humanPayload: Record<string, unknown> | null;
  reviewReason: string | null;
}

export interface CaseWorkspace {
  safetyCase: Record<string, unknown>;
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
  draft: CaseDraftRecord;
  assessments: CaseAssessmentRecord[];
  narratives: CaseNarrativeRecord[];
  assistSuggestions: CaseAssistRecord[];
  reviewTasks: Array<Record<string, unknown>>;
  followUps: Array<Record<string, unknown>>;
  sourceDocuments: Array<Record<string, unknown>>;
  caseVersions: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function reason(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length < 10) {
    throw new Error(`${label} must contain at least 10 characters.`);
  }
  return normalized;
}

function assertEditable(caseStatus: string): void {
  if (
    ["FINAL", "FINALIZED", "SUBMITTED", "CLOSED", "VOID"].includes(caseStatus)
  ) {
    throw new Error("Finalized/closed safety cases cannot be edited in-place.");
  }
}

function validateDraft(draft: CaseDraftPayload): CaseDraftPayload {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    throw new Error("A case draft object is required.");
  }
  if (!draft.identification?.caseKey?.trim()) {
    throw new Error("Case identification requires caseKey.");
  }
  if (!draft.identification.initialReceiptDate) {
    throw new Error("Case initialReceiptDate is required.");
  }
  if (!draft.identification.latestReceiptDate) {
    throw new Error("Case latestReceiptDate is required.");
  }
  if (
    new Date(draft.identification.latestReceiptDate).getTime() <
    new Date(draft.identification.initialReceiptDate).getTime()
  ) {
    throw new Error("Case latestReceiptDate cannot precede initialReceiptDate.");
  }
  if (!draft.patient?.patientKey?.trim()) {
    throw new Error("A case patient is required.");
  }
  if (!Array.isArray(draft.reporters) || draft.reporters.length === 0) {
    throw new Error("At least one reporter is required.");
  }
  if (!Array.isArray(draft.products) || draft.products.length === 0) {
    throw new Error("At least one product is required.");
  }
  if (!Array.isArray(draft.events) || draft.events.length === 0) {
    throw new Error("At least one event/reaction is required.");
  }

  const ensureUnique = (
    label: string,
    values: Array<Record<string, unknown>>,
    key: string,
  ) => {
    const seen = new Set<string>();
    for (const value of values) {
      const current = String(value[key] ?? "").trim();
      if (!current) throw new Error(`${label} requires ${key}.`);
      if (seen.has(current)) {
        throw new Error(`Duplicate ${label} key: ${current}.`);
      }
      seen.add(current);
    }
  };

  ensureUnique(
    "reporter",
    draft.reporters as unknown as Array<Record<string, unknown>>,
    "reporterKey",
  );
  ensureUnique(
    "product",
    draft.products as unknown as Array<Record<string, unknown>>,
    "productKey",
  );
  ensureUnique(
    "event",
    draft.events as unknown as Array<Record<string, unknown>>,
    "eventKey",
  );
  ensureUnique(
    "test",
    (draft.tests ?? []) as unknown as Array<Record<string, unknown>>,
    "testKey",
  );

  for (const product of draft.products) {
    if (!product.reportedName?.trim()) {
      throw new Error("Every case product requires reportedName.");
    }
  }
  for (const event of draft.events) {
    if (!event.reportedTerm?.trim()) {
      throw new Error("Every case event requires reportedTerm.");
    }
    if (
      event.onsetDate &&
      event.endDate &&
      new Date(event.endDate).getTime() < new Date(event.onsetDate).getTime()
    ) {
      throw new Error(
        `Event ${event.eventKey} endDate cannot precede onsetDate.`,
      );
    }
  }

  return JSON.parse(JSON.stringify(draft)) as CaseDraftPayload;
}

async function loadCaseBase(
  client: PoolClient,
  tenantId: string,
  caseId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT safety_case.*, intake.priority, intake.source_lineage,
            intake.source_lineage_sha256, intake.special_situations,
            source.id AS source_id, source.source_type, source.source_system,
            source.external_reference, source.received_at, source.source_payload,
            source.source_sha256
       FROM safety_cases safety_case
       JOIN safety_intake_records intake
         ON intake.id = safety_case.intake_record_id
        AND intake.tenant_id = safety_case.tenant_id
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = safety_case.tenant_id
      WHERE safety_case.tenant_id = $1
        AND safety_case.id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE OF safety_case" : ""}`,
    [tenantId, caseId],
  );
  if (!result.rows[0]) {
    throw new Error("Safety case was not found in the active tenant.");
  }
  return result.rows[0];
}

async function buildSeedDraft(
  client: PoolClient,
  tenantId: string,
  caseRow: Record<string, unknown>,
): Promise<CaseDraftPayload> {
  const intakeRecordId = String(caseRow.intake_record_id);
  const [patients, reporters, products, events, tests] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_patients
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_reporters
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY primary_source DESC, created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_products
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_events
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_tests
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
  ]);

  const patientRow = patients.rows[0];
  if (!patientRow) {
    throw new Error("The governed Intake does not contain a case patient.");
  }

  const patient = {
    patientKey: String(patientRow.patient_key),
    patientReference: text(patientRow.patient_reference),
    sex: text(patientRow.sex) as
      | "MALE"
      | "FEMALE"
      | "UNKNOWN"
      | "NOT_SPECIFIED"
      | undefined,
    ageValue: numberValue(patientRow.age_value),
    ageUnit: text(patientRow.age_unit),
    ageGroup: text(patientRow.age_group),
    dateOfBirth: text(patientRow.date_of_birth),
    deathDate: text(patientRow.death_date),
    weightKg: numberValue(patientRow.weight_kg),
    heightCm: numberValue(patientRow.height_cm),
    pregnancyStatus: text(patientRow.pregnancy_status),
    medicalHistory: array(patientRow.medical_history),
    parentInformation: object(patientRow.parent_information),
    e2bD: object(patientRow.e2b_d_payload),
  };

  return validateDraft({
    identification: {
      caseKey: String(caseRow.case_key),
      reportType: text(caseRow.report_type),
      studyType: text(caseRow.study_type),
      countryCode: text(caseRow.country_code),
      initialReceiptDate: String(caseRow.initial_receipt_date),
      latestReceiptDate: String(caseRow.latest_receipt_date),
      seriousnessStatus: String(
        caseRow.seriousness_status,
      ) as CaseDraftPayload["identification"]["seriousnessStatus"],
      expeditedReportingRequired:
        typeof caseRow.expedited_reporting_required === "boolean"
          ? caseRow.expedited_reporting_required
          : null,
    },
    reporters: reporters.rows.map((row) => ({
      reporterKey: String(row.reporter_key),
      primarySource: row.primary_source === true,
      qualification: text(row.qualification),
      organization: text(row.organization),
      countryCode: text(row.country_code),
      reporterPayload: object(row.reporter_payload),
      e2bC2: object(row.e2b_c2_payload),
    })),
    patient,
    events: events.rows.map((row) => ({
      eventKey: String(row.event_key),
      reportedTerm: String(row.reported_term),
      meddraTerm: text(row.meddra_term),
      meddraCode: text(row.meddra_code),
      meddraVersion: text(row.meddra_version),
      onsetDate: text(row.onset_date),
      endDate: text(row.end_date),
      outcome: text(row.outcome),
      seriousness:
        typeof row.seriousness === "boolean" ? row.seriousness : undefined,
      seriousnessCriteria: object(
        row.seriousness_criteria,
      ) as Record<string, boolean>,
      medicallyConfirmed:
        typeof row.medically_confirmed === "boolean"
          ? row.medically_confirmed
          : undefined,
      countryCode: text(row.country_code),
      e2bE: object(row.e2b_e_payload),
    })),
    tests: tests.rows.map((row) => ({
      testKey: String(row.test_key),
      testName: String(row.test_name),
      testDate: text(row.test_date),
      resultValue: text(row.result_value),
      resultUnit: text(row.result_unit),
      referenceRange: text(row.reference_range),
      comments: text(row.comments),
      e2bF: object(row.e2b_f_payload),
    })),
    products: products.rows.map((row) => ({
      productKey: String(row.product_key),
      reportedName: String(row.reported_name),
      roleCharacterization: String(
        row.role_characterization,
      ) as CaseDraftPayload["products"][number]["roleCharacterization"],
      activeSubstances: array(row.active_substances),
      authorization: object(row.authorization),
      indication: object(row.indication),
      dosage: array(row.dosage),
      route: object(row.route),
      therapyDates: object(row.therapy_dates),
      batchLotNumber: text(row.batch_lot_number),
      actionTaken: text(row.action_taken),
      rechallenge: object(row.rechallenge),
      e2bG: object(row.e2b_g_payload),
    })),
    medicalHistory: array(patientRow.medical_history),
    additionalInformation: {
      additionalPatients: patients.rows.slice(1).map((row) => ({
        patientKey: row.patient_key,
        patientReference: row.patient_reference,
      })),
      specialSituations: array(caseRow.special_situations),
      sourceLineage: object(caseRow.source_lineage),
      sourceLineageSha256: caseRow.source_lineage_sha256,
    },
  });
}

async function insertAssistSuggestions(
  client: PoolClient,
  principal: RequestPrincipal,
  caseId: string,
  revision: number,
  draft: CaseDraftPayload,
): Promise<void> {
  const suggestions = evaluateCaseAssist(draft);
  for (const suggestion of suggestions) {
    await client.query(
      `INSERT INTO safety_case_assist_suggestions (
         tenant_id, case_id, draft_revision, suggestion_type,
         suggestion_payload, confidence, evidence
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)`,
      [
        principal.tenantId,
        caseId,
        revision,
        suggestion.suggestionType,
        JSON.stringify(suggestion.payload),
        suggestion.confidence,
        JSON.stringify(suggestion.evidence),
      ],
    );
  }
}

async function ensureInitialDraft(
  client: PoolClient,
  principal: RequestPrincipal,
  caseId: string,
): Promise<void> {
  const caseRow = await loadCaseBase(
    client,
    principal.tenantId,
    caseId,
    true,
  );
  if (Number(caseRow.current_draft_revision ?? 0) > 0) return;

  const draft = await buildSeedDraft(
    client,
    principal.tenantId,
    caseRow,
  );
  const draftSha256 = canonicalSha256(draft);

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO safety_case_draft_versions (
       tenant_id, case_id, revision, draft_payload, draft_sha256,
       change_reason, source_kind, created_by
     ) VALUES (
       $1,$2,1,$3::jsonb,$4,
       'Initial case draft seeded from governed Intake data.',
       'INTAKE_SEED',$5
     )
     RETURNING id`,
    [
      principal.tenantId,
      caseId,
      JSON.stringify(draft),
      draftSha256,
      principal.userId,
    ],
  );

  await client.query(
    `UPDATE safety_cases
        SET current_draft_revision = 1,
            case_status = CASE
              WHEN case_status IN ('OPEN', 'NEW') THEN 'NEW'
              ELSE case_status
            END,
            updated_by = $3,
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2`,
    [principal.tenantId, caseId, principal.userId],
  );

  const sourceFacts = deterministicNarrativeDraft(draft);
  await client.query(
    `INSERT INTO safety_case_narrative_versions (
       tenant_id, case_id, narrative_version, narrative_stage,
       narrative_text, source_revision, change_reason,
       narrative_sha256, created_by
     ) VALUES (
       $1,$2,1,'SOURCE_FACTS',$3,1,
       'Structured source facts captured when the case draft was initialized.',
       $4,$5
     )`,
    [
      principal.tenantId,
      caseId,
      sourceFacts,
      canonicalSha256({ narrativeText: sourceFacts }),
      principal.userId,
    ],
  );

  await insertAssistSuggestions(client, principal, caseId, 1, draft);

  await client.query(
    `INSERT INTO audit_events (
       tenant_id, actor_id, event_type, event_category, outcome, details
     ) VALUES (
       $1,$2,'CASE_DRAFT_INITIALIZED','NEXUS_CASE_PROCESSING',
       'success',$3::jsonb
     )`,
    [
      principal.tenantId,
      principal.userId,
      JSON.stringify({
        caseId,
        draftId: inserted.rows[0].id,
        revision: 1,
        draftSha256,
      }),
    ],
  );
}

function mapDraft(row: Record<string, unknown>): CaseDraftRecord {
  return {
    id: String(row.id),
    revision: Number(row.revision),
    payload: object(row.draft_payload) as unknown as CaseDraftPayload,
    draftSha256: String(row.draft_sha256),
    sourceKind: String(row.source_kind),
    changeReason: String(row.change_reason),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapAssessment(row: Record<string, unknown>): CaseAssessmentRecord {
  return {
    id: String(row.id),
    productKey: String(row.product_key),
    eventKey: String(row.event_key),
    assessmentType: String(row.assessment_type) as CaseAssessmentType,
    result: String(row.result),
    rationale: String(row.rationale),
    evidence: object(row.evidence),
    assessmentVersion: Number(row.assessment_version),
    assessedAt: new Date(String(row.assessed_at)).toISOString(),
  };
}

function mapNarrative(row: Record<string, unknown>): CaseNarrativeRecord {
  return {
    id: String(row.id),
    narrativeVersion: Number(row.narrative_version),
    narrativeStage: String(row.narrative_stage) as CaseNarrativeStage,
    narrativeText: String(row.narrative_text),
    sourceRevision:
      row.source_revision === null || row.source_revision === undefined
        ? null
        : Number(row.source_revision),
    changeReason: String(row.change_reason),
    narrativeSha256: String(row.narrative_sha256),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapAssist(row: Record<string, unknown>): CaseAssistRecord {
  return {
    id: String(row.id),
    draftRevision: Number(row.draft_revision),
    suggestionType: String(row.suggestion_type),
    payload: object(row.suggestion_payload),
    confidence: Number(row.confidence),
    evidence: object(row.evidence),
    status: String(row.status),
    humanPayload: row.human_payload ? object(row.human_payload) : null,
    reviewReason: row.review_reason ? String(row.review_reason) : null,
  };
}

export async function listCaseWorklist(input: {
  principal: RequestPrincipal;
  limit?: number;
}): Promise<CaseWorklistRow[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT safety_case.id, safety_case.case_key,
            safety_case.intake_record_id, safety_case.case_status,
            safety_case.seriousness_status, safety_case.assigned_to,
            safety_case.current_draft_revision, safety_case.current_version,
            safety_case.initial_receipt_date::text,
            safety_case.latest_receipt_date::text,
            safety_case.updated_at,
            intake.priority
       FROM safety_cases safety_case
       JOIN safety_intake_records intake
         ON intake.id = safety_case.intake_record_id
        AND intake.tenant_id = safety_case.tenant_id
      WHERE safety_case.tenant_id = $1
      ORDER BY
        CASE intake.priority
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'NORMAL' THEN 3
          ELSE 4
        END,
        safety_case.updated_at DESC
      LIMIT $2`,
    [input.principal.tenantId, limit],
  );

  return result.rows.map((row) => ({
    caseId: String(row.id),
    caseKey: String(row.case_key),
    intakeRecordId: String(row.intake_record_id),
    caseStatus: String(row.case_status),
    priority: String(row.priority),
    seriousnessStatus: String(row.seriousness_status),
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    currentDraftRevision: Number(row.current_draft_revision),
    currentVersion: Number(row.current_version),
    initialReceiptDate: String(row.initial_receipt_date),
    latestReceiptDate: String(row.latest_receipt_date),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }));
}

export async function getCaseWorkspace(input: {
  principal: RequestPrincipal;
  caseId: string;
}): Promise<CaseWorkspace> {
  const caseId = input.caseId.trim();
  if (!caseId) throw new Error("caseId is required.");

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await ensureInitialDraft(client, input.principal, caseId);
    await client.query("COMMIT");

    const caseRow = await loadCaseBase(
      client,
      input.principal.tenantId,
      caseId,
    );
    const currentRevision = Number(caseRow.current_draft_revision);
    const [
      intake,
      source,
      draft,
      assessments,
      narratives,
      assist,
      reviewTasks,
      followUps,
      sourceDocuments,
      caseVersions,
      auditEvents,
    ] = await Promise.all([
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_intake_records
          WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [input.principal.tenantId, String(caseRow.intake_record_id)],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_sources
          WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [input.principal.tenantId, String(caseRow.source_id)],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_case_draft_versions
          WHERE tenant_id = $1 AND case_id = $2 AND revision = $3
          LIMIT 1`,
        [input.principal.tenantId, caseId, currentRevision],
      ),
      client.query<Record<string, unknown>>(
        `SELECT DISTINCT ON (
           product_key, event_key, assessment_type
         ) *
           FROM safety_case_assessments
          WHERE tenant_id = $1 AND case_id = $2
          ORDER BY product_key, event_key, assessment_type,
                   assessment_version DESC`,
        [input.principal.tenantId, caseId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_case_narrative_versions
          WHERE tenant_id = $1 AND case_id = $2
          ORDER BY narrative_version DESC`,
        [input.principal.tenantId, caseId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_case_assist_suggestions
          WHERE tenant_id = $1 AND case_id = $2 AND draft_revision = $3
          ORDER BY created_at`,
        [input.principal.tenantId, caseId, currentRevision],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_review_tasks
          WHERE tenant_id = $1
            AND (
              (entity_type = 'CASE' AND entity_id = $2)
              OR (
                entity_type = 'CASE_VERSION' AND entity_id IN (
                  SELECT id FROM safety_case_versions
                  WHERE tenant_id = $1 AND case_id = $2
                )
              )
            )
          ORDER BY created_at DESC`,
        [input.principal.tenantId, caseId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT * FROM safety_case_followup_links
          WHERE tenant_id = $1 AND case_id = $2
          ORDER BY sequence_number DESC`,
        [input.principal.tenantId, caseId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT id, document_key, file_name, content_type, size_bytes,
                content_sha256, extraction_status, extracted_text_sha256,
                created_at
           FROM safety_source_documents
          WHERE tenant_id = $1 AND intake_record_id = $2
          ORDER BY created_at DESC`,
        [input.principal.tenantId, String(caseRow.intake_record_id)],
      ),
      client.query<Record<string, unknown>>(
        `SELECT id, version, version_type, e2b_profile, schema_version,
                case_sha256, change_reason, created_at
           FROM safety_case_versions
          WHERE tenant_id = $1 AND case_id = $2
          ORDER BY version DESC`,
        [input.principal.tenantId, caseId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT id, actor_id, event_type, event_category, outcome,
                details, occurred_at
           FROM audit_events
          WHERE tenant_id = $1
            AND (
              details->>'caseId' = $2
              OR details->>'intakeRecordId' = $3
            )
          ORDER BY occurred_at DESC
          LIMIT 200`,
        [
          input.principal.tenantId,
          caseId,
          String(caseRow.intake_record_id),
        ],
      ),
    ]);

    if (!draft.rows[0]) {
      throw new Error("Current case draft could not be loaded.");
    }

    return {
      safetyCase: caseRow,
      intake: intake.rows[0] ?? {},
      source: source.rows[0] ?? {},
      draft: mapDraft(draft.rows[0]),
      assessments: assessments.rows.map(mapAssessment),
      narratives: narratives.rows.map(mapNarrative),
      assistSuggestions: assist.rows.map(mapAssist),
      reviewTasks: reviewTasks.rows,
      followUps: followUps.rows,
      sourceDocuments: sourceDocuments.rows,
      caseVersions: caseVersions.rows,
      auditEvents: auditEvents.rows,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveCaseDraft(input: {
  principal: RequestPrincipal;
  caseId: string;
  draft: CaseDraftPayload;
  changeReason: string;
  sourceKind?: "PROCESSOR" | "QC_CORRECTION" | "MEDICAL_CORRECTION" | "FOLLOW_UP_MERGE";
}): Promise<CaseWorkspace> {
  const caseId = input.caseId.trim();
  if (!caseId) throw new Error("caseId is required.");
  const changeReason = reason(input.changeReason, "Case draft change reason");
  const draft = validateDraft(input.draft);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await ensureInitialDraft(client, input.principal, caseId);
    const caseRow = await loadCaseBase(
      client,
      input.principal.tenantId,
      caseId,
      true,
    );
    assertEditable(String(caseRow.case_status));

    if (draft.identification.caseKey !== String(caseRow.case_key)) {
      throw new Error("Case draft caseKey cannot diverge from the stored case.");
    }

    const nextRevision = Number(caseRow.current_draft_revision) + 1;
    const draftSha256 = canonicalSha256(draft);

    await client.query(
      `INSERT INTO safety_case_draft_versions (
         tenant_id, case_id, revision, draft_payload, draft_sha256,
         change_reason, source_kind, created_by
       ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
      [
        input.principal.tenantId,
        caseId,
        nextRevision,
        JSON.stringify(draft),
        draftSha256,
        changeReason,
        input.sourceKind ?? "PROCESSOR",
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_cases
          SET current_draft_revision = $3,
              case_status = 'PROCESSING',
              processing_started_at = COALESCE(processing_started_at, now()),
              report_type = $4,
              study_type = $5,
              country_code = $6,
              latest_receipt_date = $7,
              seriousness_status = $8,
              expedited_reporting_required = $9,
              updated_by = $10,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        caseId,
        nextRevision,
        draft.identification.reportType ?? null,
        draft.identification.studyType ?? null,
        draft.identification.countryCode ?? null,
        draft.identification.latestReceiptDate,
        draft.identification.seriousnessStatus,
        draft.identification.expeditedReportingRequired ?? null,
        input.principal.userId,
      ],
    );

    await insertAssistSuggestions(
      client,
      input.principal,
      caseId,
      nextRevision,
      draft,
    );

    await client.query(
      `UPDATE safety_review_tasks
          SET status = CASE WHEN status = 'OPEN' THEN 'IN_PROGRESS' ELSE status END,
              assigned_to = COALESCE(assigned_to, $3),
              updated_at = now()
        WHERE tenant_id = $1
          AND entity_type = 'CASE'
          AND entity_id = $2
          AND task_type = 'CASE_PROCESSING'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [input.principal.tenantId, caseId, input.principal.userId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_DRAFT_SAVED','NEXUS_CASE_PROCESSING',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId,
          revision: nextRevision,
          draftSha256,
          changeReason,
          sourceKind: input.sourceKind ?? "PROCESSOR",
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

  return getCaseWorkspace({ principal: input.principal, caseId });
}

export async function assignCase(input: {
  principal: RequestPrincipal;
  caseId: string;
  assignedTo: string | null;
  changeReason: string;
}): Promise<CaseWorkspace> {
  const caseId = input.caseId.trim();
  const changeReason = reason(input.changeReason, "Assignment reason");

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const caseRow = await loadCaseBase(
      client,
      input.principal.tenantId,
      caseId,
      true,
    );
    assertEditable(String(caseRow.case_status));

    await client.query(
      `UPDATE safety_cases
          SET assigned_to = $3,
              case_status = CASE
                WHEN $3::uuid IS NULL THEN 'NEW'
                ELSE 'ASSIGNED'
              END,
              updated_by = $4,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        caseId,
        input.assignedTo,
        input.principal.userId,
      ],
    );

    await client.query(
      `UPDATE safety_review_tasks
          SET assigned_to = $3,
              status = CASE WHEN $3::uuid IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END,
              updated_at = now()
        WHERE tenant_id = $1
          AND entity_type = 'CASE'
          AND entity_id = $2
          AND task_type = 'CASE_PROCESSING'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [input.principal.tenantId, caseId, input.assignedTo],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_ASSIGNMENT_CHANGED','NEXUS_CASE_PROCESSING',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId,
          assignedTo: input.assignedTo,
          changeReason,
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

  return getCaseWorkspace({ principal: input.principal, caseId });
}

export async function saveCaseAssessment(input: {
  principal: RequestPrincipal;
  caseId: string;
  productKey: string;
  eventKey: string;
  assessmentType: CaseAssessmentType;
  result: string;
  rationale: string;
  evidence?: Record<string, unknown>;
}): Promise<CaseWorkspace> {
  const caseId = input.caseId.trim();
  const productKey = input.productKey.trim();
  const eventKey = input.eventKey.trim();
  const result = input.result.trim();
  const rationale = reason(input.rationale, "Assessment rationale");

  if (
    !(CASE_ASSESSMENT_TYPES as readonly string[]).includes(
      input.assessmentType,
    )
  ) {
    throw new Error("Unsupported case assessment type.");
  }
  if (!productKey || !eventKey || !result) {
    throw new Error("productKey, eventKey and result are required.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await ensureInitialDraft(client, input.principal, caseId);
    const caseRow = await loadCaseBase(
      client,
      input.principal.tenantId,
      caseId,
      true,
    );
    assertEditable(String(caseRow.case_status));

    const draftResult = await client.query<{ draft_payload: unknown }>(
      `SELECT draft_payload
         FROM safety_case_draft_versions
        WHERE tenant_id = $1 AND case_id = $2 AND revision = $3
        LIMIT 1`,
      [
        input.principal.tenantId,
        caseId,
        Number(caseRow.current_draft_revision),
      ],
    );
    const draft = object(
      draftResult.rows[0]?.draft_payload,
    ) as unknown as CaseDraftPayload;

    if (!draft.products?.some((item) => item.productKey === productKey)) {
      throw new Error("Assessment productKey is not present in the current case draft.");
    }
    if (!draft.events?.some((item) => item.eventKey === eventKey)) {
      throw new Error("Assessment eventKey is not present in the current case draft.");
    }

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(assessment_version), 0) + 1 AS next_version
         FROM safety_case_assessments
        WHERE tenant_id = $1 AND case_id = $2
          AND product_key = $3 AND event_key = $4
          AND assessment_type = $5`,
      [
        input.principal.tenantId,
        caseId,
        productKey,
        eventKey,
        input.assessmentType,
      ],
    );

    await client.query(
      `INSERT INTO safety_case_assessments (
         tenant_id, case_id, product_key, event_key, assessment_type,
         result, rationale, evidence, assessment_version, assessed_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [
        input.principal.tenantId,
        caseId,
        productKey,
        eventKey,
        input.assessmentType,
        result,
        rationale,
        JSON.stringify(input.evidence ?? {}),
        Number(nextVersion.rows[0].next_version),
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_ASSESSMENT_RECORDED','NEXUS_CASE_PROCESSING',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId,
          productKey,
          eventKey,
          assessmentType: input.assessmentType,
          result,
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

  return getCaseWorkspace({ principal: input.principal, caseId });
}

export async function saveNarrativeVersion(input: {
  principal: RequestPrincipal;
  caseId: string;
  narrativeStage: CaseNarrativeStage;
  narrativeText: string;
  changeReason: string;
}): Promise<CaseWorkspace> {
  const caseId = input.caseId.trim();
  const narrativeText = input.narrativeText.trim();
  const changeReason = reason(input.changeReason, "Narrative change reason");

  if (
    !(CASE_NARRATIVE_STAGES as readonly string[]).includes(
      input.narrativeStage,
    )
  ) {
    throw new Error("Unsupported narrative stage.");
  }
  if (narrativeText.length < 10) {
    throw new Error("Narrative text must contain at least 10 characters.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    await ensureInitialDraft(client, input.principal, caseId);
    const caseRow = await loadCaseBase(
      client,
      input.principal.tenantId,
      caseId,
      true,
    );
    assertEditable(String(caseRow.case_status));

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(narrative_version), 0) + 1 AS next_version
         FROM safety_case_narrative_versions
        WHERE tenant_id = $1 AND case_id = $2`,
      [input.principal.tenantId, caseId],
    );

    const narrativeSha256 = canonicalSha256({ narrativeText });
    await client.query(
      `INSERT INTO safety_case_narrative_versions (
         tenant_id, case_id, narrative_version, narrative_stage,
         narrative_text, source_revision, change_reason,
         narrative_sha256, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.principal.tenantId,
        caseId,
        Number(nextVersion.rows[0].next_version),
        input.narrativeStage,
        narrativeText,
        Number(caseRow.current_draft_revision),
        changeReason,
        narrativeSha256,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_NARRATIVE_VERSION_CREATED','NEXUS_CASE_PROCESSING',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId,
          narrativeStage: input.narrativeStage,
          narrativeSha256,
          changeReason,
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

  return getCaseWorkspace({ principal: input.principal, caseId });
}

export async function generateSystemNarrative(input: {
  principal: RequestPrincipal;
  caseId: string;
  changeReason: string;
}): Promise<CaseWorkspace> {
  const workspace = await getCaseWorkspace({
    principal: input.principal,
    caseId: input.caseId,
  });

  return saveNarrativeVersion({
    principal: input.principal,
    caseId: input.caseId,
    narrativeStage: "SYSTEM_DRAFT",
    narrativeText: deterministicNarrativeDraft(workspace.draft.payload),
    changeReason: reason(
      input.changeReason,
      "System narrative generation reason",
    ),
  });
}

export async function reviewCaseAssistSuggestion(input: {
  principal: RequestPrincipal;
  caseId: string;
  suggestionId: string;
  decision: "ACCEPTED" | "EDITED" | "REJECTED";
  humanPayload?: Record<string, unknown>;
  reviewReason: string;
}): Promise<CaseWorkspace> {
  const reviewReason = reason(input.reviewReason, "Suggestion review reason");
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_case_assist_suggestions
        WHERE tenant_id = $1 AND case_id = $2 AND id = $3
        FOR UPDATE`,
      [input.principal.tenantId, input.caseId, input.suggestionId],
    );
    const suggestion = result.rows[0];
    if (!suggestion) throw new Error("Case assist suggestion was not found.");
    if (String(suggestion.status) !== "PENDING") {
      throw new Error("Case assist suggestion has already been reviewed.");
    }
    if (input.decision === "EDITED" && !input.humanPayload) {
      throw new Error("Edited suggestions require humanPayload.");
    }

    await client.query(
      `UPDATE safety_case_assist_suggestions
          SET status = $4,
              human_payload = $5::jsonb,
              review_reason = $6,
              reviewed_by = $7,
              reviewed_at = now()
        WHERE tenant_id = $1 AND case_id = $2 AND id = $3`,
      [
        input.principal.tenantId,
        input.caseId,
        input.suggestionId,
        input.decision,
        input.humanPayload ? JSON.stringify(input.humanPayload) : null,
        reviewReason,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_ASSIST_SUGGESTION_REVIEWED',
         'NEXUS_CASE_PROCESSING','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          suggestionId: input.suggestionId,
          decision: input.decision,
          reviewReason,
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

  return getCaseWorkspace({
    principal: input.principal,
    caseId: input.caseId,
  });
}
