import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import { moduleIsEffectivelyEnabled } from "@/lib/nexus/entitlement-service";
import { NEXUS_MODULES } from "@/lib/nexus/modules";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";
import {
  createSafetyCaseShellInTransaction,
  type SafetyCaseSummary,
} from "@/lib/safety/common/safety-case-service";
import {
  INTAKE_DISPOSITION_TYPES,
  type IntakeDispositionRequest,
  type IntakeDispositionType,
} from "./disposition-types";

export interface IntakeDispositionRecord {
  id: string;
  dispositionVersion: number;
  dispositionType: IntakeDispositionType;
  targetCaseId: string | null;
  targetIntakeRecordId: string | null;
  externalSystem: string | null;
  externalCaseReference: string | null;
  externalHandoffPackageId: string | null;
  rationale: string;
  metadata: Record<string, unknown>;
  disposedAt: string;
}

export interface ExternalHandoffRecord {
  id: string;
  destinationSystem: string;
  packageFormat: string;
  packageVersion: number;
  payloadSha256: string;
  status: string;
  preparedAt: string;
  downloadedAt: string | null;
}

export interface DispositionWorkspace {
  intake: Record<string, unknown>;
  caseProcessingEnabled: boolean;
  allowedDispositions: IntakeDispositionType[];
  latestDisposition: IntakeDispositionRecord | null;
  latestHandoff: ExternalHandoffRecord | null;
  createdCase: SafetyCaseSummary | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireRationale(value: string): string {
  const rationale = value.trim();
  if (rationale.length < 10) {
    throw new Error("Disposition rationale must contain at least 10 characters.");
  }
  return rationale;
}

function mapDisposition(row: Record<string, unknown>): IntakeDispositionRecord {
  return {
    id: String(row.id),
    dispositionVersion: Number(row.disposition_version),
    dispositionType: String(row.disposition_type) as IntakeDispositionType,
    targetCaseId: row.target_case_id ? String(row.target_case_id) : null,
    targetIntakeRecordId: row.target_intake_record_id
      ? String(row.target_intake_record_id)
      : null,
    externalSystem: text(row.external_system),
    externalCaseReference: text(row.external_case_reference),
    externalHandoffPackageId: row.external_handoff_package_id
      ? String(row.external_handoff_package_id)
      : null,
    rationale: String(row.rationale),
    metadata: object(row.metadata),
    disposedAt: new Date(String(row.disposed_at)).toISOString(),
  };
}

function mapHandoff(row: Record<string, unknown>): ExternalHandoffRecord {
  return {
    id: String(row.id),
    destinationSystem: String(row.destination_system),
    packageFormat: String(row.package_format),
    packageVersion: Number(row.package_version),
    payloadSha256: String(row.payload_sha256),
    status: String(row.status),
    preparedAt: new Date(String(row.prepared_at)).toISOString(),
    downloadedAt: row.downloaded_at
      ? new Date(String(row.downloaded_at)).toISOString()
      : null,
  };
}

async function loadIntake(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
  forUpdate = false,
): Promise<Record<string, unknown>> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT intake.*, source.source_type, source.source_system,
            source.external_reference AS source_external_reference,
            source.received_at, source.source_payload, source.source_sha256
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
  if (!result.rows[0]) {
    throw new Error("Safety Intake was not found in the active tenant.");
  }
  return result.rows[0];
}

function allowedForIntake(
  intake: Record<string, unknown>,
  caseProcessingEnabled: boolean,
): IntakeDispositionType[] {
  const allowed = new Set<IntakeDispositionType>(["HOLD"]);
  const validity = String(intake.validity_status || "");
  const triageOutcome = String(intake.triage_outcome || "");
  const duplicateComplete = String(intake.duplicate_review_status) === "COMPLETE";
  const relationship = String(intake.case_relationship || "");

  if (
    validity === "VALID" &&
    duplicateComplete &&
    ["NEW_CASE", "NOT_MATCH"].includes(relationship)
  ) {
    allowed.add("EXPORT_EXTERNAL");
    if (caseProcessingEnabled) allowed.add("CREATE_NEXUS_CASE");
  }

  if (
    validity === "VALID" &&
    duplicateComplete &&
    relationship === "FOLLOW_UP"
  ) {
    allowed.add("FOLLOW_UP_EXISTING_CASE");
    allowed.add("EXPORT_EXTERNAL");
  }

  if (
    validity === "VALID" &&
    duplicateComplete &&
    relationship === "DUPLICATE"
  ) {
    allowed.add("DUPLICATE");
  }

  if (
    triageOutcome === "FOLLOW_UP_REQUIRED" ||
    intake.follow_up_required === true
  ) {
    allowed.add("INCOMPLETE_FOLLOW_UP");
  }

  if (
    validity === "INVALID" ||
    triageOutcome === "NOT_VALID_ICSR"
  ) {
    allowed.add("NON_CASE");
  }

  return INTAKE_DISPOSITION_TYPES.filter((item) => allowed.has(item));
}

async function buildHandoffPayload(
  client: PoolClient,
  tenantId: string,
  intakeRecordId: string,
): Promise<Record<string, unknown>> {
  const intake = await loadIntake(client, tenantId, intakeRecordId);
  const [
    patients,
    reporters,
    products,
    events,
    tests,
    documents,
    triage,
    duplicate,
  ] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_patients
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
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
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_events
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_tests
        WHERE tenant_id = $1 AND intake_record_id = $2 ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT id, document_key, file_name, content_type, size_bytes,
              content_sha256, extraction_status, extracted_text_sha256
         FROM safety_source_documents
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_triage_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_duplicate_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version DESC
        LIMIT 1`,
      [tenantId, intakeRecordId],
    ),
  ]);

  return {
    profile: "NEXUS_SAFETY_INTAKE_HANDOFF",
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    intake: {
      id: intake.id,
      intakeKey: intake.intake_key,
      intakeChannel: intake.intake_channel,
      status: intake.status,
      priority: intake.priority,
      validityStatus: intake.validity_status,
      seriousnessStatus: intake.seriousness_status,
      duplicateStatus: intake.duplicate_status,
      caseRelationship: intake.case_relationship,
      initialReceiptDate: intake.initial_receipt_date,
      latestReceiptDate: intake.latest_receipt_date,
      countryCode: intake.country_code,
      specialSituations: intake.special_situations,
      sourceLineage: intake.source_lineage,
      sourceLineageSha256: intake.source_lineage_sha256,
    },
    source: {
      sourceType: intake.source_type,
      sourceSystem: intake.source_system,
      externalReference: intake.source_external_reference,
      receivedAt: intake.received_at,
      sourceSha256: intake.source_sha256,
      sourcePayload: intake.source_payload,
    },
    patient: patients.rows,
    reporters: reporters.rows,
    products: products.rows,
    events: events.rows,
    tests: tests.rows,
    sourceDocuments: documents.rows,
    triageAssessment: triage.rows[0] ?? null,
    duplicateAssessment: duplicate.rows[0] ?? null,
    governance: {
      rawSourceBytesIncluded: false,
      generatedFromTenantScopedRecords: true,
    },
  };
}

function autoCaseKey(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `NXS-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function getDispositionWorkspace(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
}): Promise<DispositionWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");

  const client = await getPostgresPool().connect();
  try {
    const intake = await loadIntake(
      client,
      input.principal.tenantId,
      intakeRecordId,
    );
    if (String(intake.triage_status) !== "COMPLETE") {
      throw new Error("Formal triage must be complete before disposition.");
    }

    const caseProcessingEnabled = await moduleIsEffectivelyEnabled(
      input.principal.tenantId,
      input.principal.environment,
      NEXUS_MODULES.CASE_PROCESSING,
    );

    const [disposition, handoff, safetyCase] = await Promise.all([
      client.query<Record<string, unknown>>(
        `SELECT *
           FROM safety_intake_dispositions
          WHERE tenant_id = $1 AND intake_record_id = $2
          ORDER BY disposition_version DESC
          LIMIT 1`,
        [input.principal.tenantId, intakeRecordId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT *
           FROM safety_external_handoff_packages
          WHERE tenant_id = $1 AND intake_record_id = $2
          ORDER BY prepared_at DESC
          LIMIT 1`,
        [input.principal.tenantId, intakeRecordId],
      ),
      client.query<Record<string, unknown>>(
        `SELECT id, case_key, intake_record_id, case_status, current_version,
                initial_receipt_date::text, latest_receipt_date::text, created_at::text
           FROM safety_cases
          WHERE tenant_id = $1 AND intake_record_id = $2
          LIMIT 1`,
        [input.principal.tenantId, intakeRecordId],
      ),
    ]);

    const caseRow = safetyCase.rows[0];
    return {
      intake,
      caseProcessingEnabled,
      allowedDispositions: allowedForIntake(intake, caseProcessingEnabled),
      latestDisposition: disposition.rows[0]
        ? mapDisposition(disposition.rows[0])
        : null,
      latestHandoff: handoff.rows[0] ? mapHandoff(handoff.rows[0]) : null,
      createdCase: caseRow
        ? {
            caseId: String(caseRow.id),
            caseKey: String(caseRow.case_key),
            intakeRecordId: String(caseRow.intake_record_id),
            caseStatus: String(caseRow.case_status),
            currentVersion: Number(caseRow.current_version),
            initialReceiptDate: String(caseRow.initial_receipt_date),
            latestReceiptDate: String(caseRow.latest_receipt_date),
            createdAt: new Date(String(caseRow.created_at)).toISOString(),
            reused: true,
          }
        : null,
    };
  } finally {
    client.release();
  }
}

async function createHandoffPackage(input: {
  client: PoolClient;
  principal: RequestPrincipal;
  intakeRecordId: string;
  dispositionId: string;
  destinationSystem: string;
}): Promise<ExternalHandoffRecord> {
  const payload = await buildHandoffPayload(
    input.client,
    input.principal.tenantId,
    input.intakeRecordId,
  );
  const payloadSha256 = canonicalSha256(payload);

  const inserted = await input.client.query<Record<string, unknown>>(
    `INSERT INTO safety_external_handoff_packages (
       tenant_id, intake_record_id, disposition_id, destination_system,
       package_format, package_version, payload, payload_sha256,
       status, prepared_by
     ) VALUES (
       $1,$2,$3,$4,'NEXUS_SAFETY_JSON',1,$5::jsonb,$6,'PREPARED',$7
     )
     RETURNING *`,
    [
      input.principal.tenantId,
      input.intakeRecordId,
      input.dispositionId,
      input.destinationSystem,
      JSON.stringify(payload),
      payloadSha256,
      input.principal.userId,
    ],
  );

  return mapHandoff(inserted.rows[0]);
}

export async function finalizeIntakeDisposition(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  request: IntakeDispositionRequest;
}): Promise<DispositionWorkspace> {
  const intakeRecordId = input.intakeRecordId.trim();
  if (!intakeRecordId) throw new Error("intakeRecordId is required.");
  if (
    !INTAKE_DISPOSITION_TYPES.includes(input.request.dispositionType)
  ) {
    throw new Error("A valid Intake dispositionType is required.");
  }
  const rationale = requireRationale(input.request.rationale);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const intake = await loadIntake(
      client,
      input.principal.tenantId,
      intakeRecordId,
      true,
    );

    if (String(intake.triage_status) !== "COMPLETE") {
      throw new Error("Formal triage must be complete before disposition.");
    }
    if (String(intake.disposition_status) === "COMPLETE") {
      throw new Error("Intake disposition is already complete.");
    }

    const caseProcessingEnabled = await moduleIsEffectivelyEnabled(
      input.principal.tenantId,
      input.principal.environment,
      NEXUS_MODULES.CASE_PROCESSING,
    );
    const allowed = allowedForIntake(intake, caseProcessingEnabled);
    if (!allowed.includes(input.request.dispositionType)) {
      throw new Error(
        `Disposition ${input.request.dispositionType} is not allowed for the current Intake state.`,
      );
    }

    const nextVersion = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(disposition_version), 0) + 1 AS next_version
         FROM safety_intake_dispositions
        WHERE tenant_id = $1 AND intake_record_id = $2`,
      [input.principal.tenantId, intakeRecordId],
    );

    let targetCaseId: string | null = text(intake.matched_case_id);
    let targetIntakeRecordId: string | null = text(
      intake.matched_intake_record_id,
    );
    let externalSystem = text(input.request.destinationSystem);
    let externalCaseReference =
      text(input.request.externalCaseReference) ??
      text(intake.matched_external_reference);
    let createdCase: SafetyCaseSummary | null = null;

    if (input.request.dispositionType === "CREATE_NEXUS_CASE") {
      if (!caseProcessingEnabled) {
        throw new Error(
          "Nexus Case Processing is not enabled for this tenant/environment.",
        );
      }

      await client.query(
        `UPDATE safety_intake_records
            SET status = 'READY_FOR_CASE',
                updated_by = $3,
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, intakeRecordId, input.principal.userId],
      );

      const sourceReceivedDate = new Date(String(intake.received_at))
        .toISOString()
        .slice(0, 10);
      createdCase = await createSafetyCaseShellInTransaction({
        client,
        principal: input.principal,
        request: {
          intakeRecordId,
          caseKey: text(input.request.caseKey) ?? autoCaseKey(),
          reportType: text(intake.source_type) ?? undefined,
          countryCode: text(intake.country_code) ?? undefined,
          initialReceiptDate:
            text(intake.initial_receipt_date) ?? sourceReceivedDate,
          latestReceiptDate:
            text(intake.latest_receipt_date) ??
            text(intake.initial_receipt_date) ??
            sourceReceivedDate,
          seriousnessStatus:
            String(intake.seriousness_status) as
              | "SERIOUS"
              | "NON_SERIOUS"
              | "UNRESOLVED",
          reason: rationale,
        },
      });
      targetCaseId = createdCase.caseId;
      targetIntakeRecordId = intakeRecordId;
    }

    if (input.request.dispositionType === "EXPORT_EXTERNAL") {
      if (!externalSystem) {
        throw new Error(
          "destinationSystem is required for EXPORT_EXTERNAL disposition.",
        );
      }
    }

    if (input.request.dispositionType === "FOLLOW_UP_EXISTING_CASE") {
      if (
        !targetCaseId &&
        !targetIntakeRecordId &&
        !externalCaseReference
      ) {
        throw new Error(
          "A matched Nexus or external case reference is required for follow-up disposition.",
        );
      }
    }

    const disposition = await client.query<Record<string, unknown>>(
      `INSERT INTO safety_intake_dispositions (
         tenant_id, intake_record_id, disposition_version, disposition_type,
         target_case_id, target_intake_record_id, external_system,
         external_case_reference, rationale, metadata, disposed_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11
       )
       RETURNING *`,
      [
        input.principal.tenantId,
        intakeRecordId,
        Number(nextVersion.rows[0].next_version),
        input.request.dispositionType,
        targetCaseId,
        targetIntakeRecordId,
        externalSystem,
        externalCaseReference,
        rationale,
        JSON.stringify(input.request.metadata ?? {}),
        input.principal.userId,
      ],
    );
    const dispositionId = String(disposition.rows[0].id);

    let handoff: ExternalHandoffRecord | null = null;
    if (input.request.dispositionType === "EXPORT_EXTERNAL") {
      handoff = await createHandoffPackage({
        client,
        principal: input.principal,
        intakeRecordId,
        dispositionId,
        destinationSystem: externalSystem!,
      });
      await client.query(
        `UPDATE safety_intake_dispositions
            SET external_handoff_package_id = $3
          WHERE tenant_id = $1 AND id = $2`,
        [input.principal.tenantId, dispositionId, handoff.id],
      );
    }

    const nextStatus: Record<IntakeDispositionType, string> = {
      CREATE_NEXUS_CASE: "CASE_CREATED",
      EXPORT_EXTERNAL: "EXPORTED",
      FOLLOW_UP_EXISTING_CASE: "DISPOSED",
      DUPLICATE: "DISPOSED",
      INCOMPLETE_FOLLOW_UP: "HOLD",
      NON_CASE: "NO_CASE",
      HOLD: "HOLD",
    };

    await client.query(
      `UPDATE safety_intake_records
          SET disposition_status = 'COMPLETE',
              disposition_type = $3,
              disposed_at = now(),
              disposed_by = $4,
              status = $5,
              updated_by = $4,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [
        input.principal.tenantId,
        intakeRecordId,
        input.request.dispositionType,
        input.principal.userId,
        nextStatus[input.request.dispositionType],
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'INTAKE_DISPOSITION_FINALIZED',
         'NEXUS_INTAKE_DISPOSITION','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          dispositionId,
          dispositionType: input.request.dispositionType,
          targetCaseId,
          targetIntakeRecordId,
          externalSystem,
          externalCaseReference,
          externalHandoffPackageId: handoff?.id ?? null,
          createdCaseId: createdCase?.caseId ?? null,
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

  return getDispositionWorkspace({
    principal: input.principal,
    intakeRecordId,
  });
}

export async function getExternalHandoffPayload(input: {
  principal: RequestPrincipal;
  intakeRecordId: string;
  packageId: string;
}): Promise<{
  payload: Record<string, unknown>;
  payloadSha256: string;
  destinationSystem: string;
  packageFormat: string;
}> {
  const intakeRecordId = input.intakeRecordId.trim();
  const packageId = input.packageId.trim();
  if (!intakeRecordId || !packageId) {
    throw new Error("intakeRecordId and packageId are required.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Record<string, unknown>>(
      `SELECT *
         FROM safety_external_handoff_packages
        WHERE tenant_id = $1
          AND intake_record_id = $2
          AND id = $3
        FOR UPDATE`,
      [input.principal.tenantId, intakeRecordId, packageId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("External handoff package was not found.");

    if (String(row.status) === "CANCELLED") {
      throw new Error("Cancelled external handoff packages cannot be downloaded.");
    }

    await client.query(
      `UPDATE safety_external_handoff_packages
          SET status = CASE
                WHEN status = 'PREPARED' THEN 'DOWNLOADED'
                ELSE status
              END,
              downloaded_at = COALESCE(downloaded_at, now())
        WHERE tenant_id = $1 AND id = $2`,
      [input.principal.tenantId, packageId],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'EXTERNAL_HANDOFF_DOWNLOADED',
         'NEXUS_INTAKE_DISPOSITION','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          intakeRecordId,
          packageId,
          destinationSystem: row.destination_system,
          payloadSha256: row.payload_sha256,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      payload: object(row.payload),
      payloadSha256: String(row.payload_sha256),
      destinationSystem: String(row.destination_system),
      packageFormat: String(row.package_format),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
