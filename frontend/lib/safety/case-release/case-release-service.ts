import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { canonicalSha256 } from "@/lib/safety/common/canonical-json";

export const CASE_EXPORT_FORMATS = [
  "NEXUS_CASE_JSON",
  "E2B_R3_MAPPING_JSON",
  "HUMAN_READABLE_HTML",
] as const;

export type CaseExportFormat = (typeof CASE_EXPORT_FORMATS)[number];

export interface CaseReleaseArtifacts {
  evidencePackages: Array<Record<string, unknown>>;
  exports: Array<Record<string, unknown>>;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadFinalCase(
  client: PoolClient,
  tenantId: string,
  caseId: string,
): Promise<{
  safetyCase: Record<string, unknown>;
  caseVersion: Record<string, unknown>;
  intake: Record<string, unknown>;
  source: Record<string, unknown>;
}> {
  const result = await client.query<Record<string, unknown>>(
    `SELECT safety_case.*,
            version.id AS version_id,
            version.version,
            version.version_type,
            version.e2b_profile,
            version.schema_version,
            version.case_payload,
            version.case_sha256,
            version.change_reason AS version_change_reason,
            version.created_at AS version_created_at,
            intake.id AS intake_id,
            intake.intake_key,
            intake.status AS intake_status,
            intake.priority,
            intake.validity_status,
            intake.duplicate_status,
            intake.seriousness_status AS intake_seriousness_status,
            intake.triage_status,
            intake.triage_outcome,
            intake.case_relationship,
            intake.disposition_status,
            intake.disposition_type,
            intake.source_lineage,
            intake.source_lineage_sha256,
            source.id AS source_id,
            source.source_key,
            source.source_type,
            source.source_system,
            source.external_reference,
            source.received_at,
            source.source_payload,
            source.source_sha256
       FROM safety_cases safety_case
       JOIN safety_case_versions version
         ON version.id = safety_case.final_version_id
        AND version.tenant_id = safety_case.tenant_id
       JOIN safety_intake_records intake
         ON intake.id = safety_case.intake_record_id
        AND intake.tenant_id = safety_case.tenant_id
       JOIN safety_sources source
         ON source.id = intake.source_id
        AND source.tenant_id = safety_case.tenant_id
      WHERE safety_case.tenant_id = $1
        AND safety_case.id = $2
      LIMIT 1`,
    [tenantId, caseId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("A finalized safety case version is required.");
  }
  if (!["FINAL", "FINALIZED", "SUBMITTED", "CLOSED"].includes(String(row.case_status))) {
    throw new Error("Evidence/export generation requires a finalized safety case.");
  }

  return {
    safetyCase: {
      id: row.id,
      caseKey: row.case_key,
      intakeRecordId: row.intake_record_id,
      caseStatus: row.case_status,
      reportType: row.report_type,
      studyType: row.study_type,
      countryCode: row.country_code,
      initialReceiptDate: row.initial_receipt_date,
      latestReceiptDate: row.latest_receipt_date,
      seriousnessStatus: row.seriousness_status,
      expeditedReportingRequired: row.expedited_reporting_required,
      currentVersion: row.current_version,
      currentDraftRevision: row.current_draft_revision,
      finalizedAt: row.finalized_at,
      finalizedBy: row.finalized_by,
    },
    caseVersion: {
      id: row.version_id,
      version: row.version,
      versionType: row.version_type,
      e2bProfile: row.e2b_profile,
      schemaVersion: row.schema_version,
      casePayload: row.case_payload,
      caseSha256: row.case_sha256,
      changeReason: row.version_change_reason,
      createdAt: row.version_created_at,
    },
    intake: {
      id: row.intake_id,
      intakeKey: row.intake_key,
      status: row.intake_status,
      priority: row.priority,
      validityStatus: row.validity_status,
      duplicateStatus: row.duplicate_status,
      seriousnessStatus: row.intake_seriousness_status,
      triageStatus: row.triage_status,
      triageOutcome: row.triage_outcome,
      caseRelationship: row.case_relationship,
      dispositionStatus: row.disposition_status,
      dispositionType: row.disposition_type,
      sourceLineage: row.source_lineage,
      sourceLineageSha256: row.source_lineage_sha256,
    },
    source: {
      id: row.source_id,
      sourceKey: row.source_key,
      sourceType: row.source_type,
      sourceSystem: row.source_system,
      externalReference: row.external_reference,
      receivedAt: row.received_at,
      sourcePayload: row.source_payload,
      sourceSha256: row.source_sha256,
    },
  };
}

async function historyBundle(
  client: PoolClient,
  tenantId: string,
  caseId: string,
  intakeRecordId: string,
): Promise<Record<string, unknown>> {
  const [
    documents,
    extractionRuns,
    extractionSuggestions,
    triageAssessments,
    duplicateRuns,
    duplicateCandidates,
    duplicateAssessments,
    dispositions,
    draftVersions,
    caseAssessments,
    narratives,
    assistSuggestions,
    reviewActions,
    queries,
    finalizationChecks,
    reviewTasks,
    followUps,
    auditEvents,
  ] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT id, document_key, file_name, content_type, size_bytes,
              content_sha256, extraction_status, extracted_text_sha256,
              created_at
         FROM safety_source_documents
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_extraction_runs
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_extraction_suggestions
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY created_at`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_triage_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_duplicate_review_runs
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY run_number`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_duplicate_candidates
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY review_run_id, rank`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_duplicate_assessments
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY assessment_version`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_intake_dispositions
        WHERE tenant_id = $1 AND intake_record_id = $2
        ORDER BY disposition_version`,
      [tenantId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_draft_versions
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY revision`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_assessments
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY product_key, event_key, assessment_type, assessment_version`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_narrative_versions
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY narrative_version`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_assist_suggestions
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY draft_revision, created_at`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_review_actions
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY acted_at`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_queries
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY raised_at`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_finalization_checks
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY check_version`,
      [tenantId, caseId],
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
            OR (entity_type = 'INTAKE_RECORD' AND entity_id = $3)
          )
        ORDER BY created_at`,
      [tenantId, caseId, intakeRecordId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT * FROM safety_case_followup_links
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY sequence_number`,
      [tenantId, caseId],
    ),
    client.query<Record<string, unknown>>(
      `SELECT id, actor_id, event_type, event_category, outcome,
              request_id, source_ip, details, occurred_at
         FROM audit_events
        WHERE tenant_id = $1
          AND (
            details->>'caseId' = $2
            OR details->>'intakeRecordId' = $3
          )
        ORDER BY occurred_at`,
      [tenantId, caseId, intakeRecordId],
    ),
  ]);

  return {
    sourceDocuments: documents.rows,
    extractionRuns: extractionRuns.rows,
    extractionSuggestions: extractionSuggestions.rows,
    triageAssessments: triageAssessments.rows,
    duplicateRuns: duplicateRuns.rows,
    duplicateCandidates: duplicateCandidates.rows,
    duplicateAssessments: duplicateAssessments.rows,
    dispositions: dispositions.rows,
    caseDraftVersions: draftVersions.rows,
    caseAssessments: caseAssessments.rows,
    narrativeVersions: narratives.rows,
    assistSuggestions: assistSuggestions.rows,
    reviewActions: reviewActions.rows,
    reviewQueries: queries.rows,
    finalizationChecks: finalizationChecks.rows,
    reviewTasks: reviewTasks.rows,
    followUps: followUps.rows,
    auditEvents: auditEvents.rows,
  };
}

function counts(bundle: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(bundle)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).length]),
  );
}

export async function listCaseReleaseArtifacts(input: {
  principal: RequestPrincipal;
  caseId: string;
}): Promise<CaseReleaseArtifacts> {
  const [evidence, exports] = await Promise.all([
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT id, case_version_id, package_version, manifest, package_sha256,
              status, generated_at
         FROM safety_case_evidence_packages
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY package_version DESC`,
      [input.principal.tenantId, input.caseId],
    ),
    getPostgresPool().query<Record<string, unknown>>(
      `SELECT id, case_version_id, evidence_package_id, export_format,
              export_version, content_sha256, generated_at
         FROM safety_case_exports
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY generated_at DESC`,
      [input.principal.tenantId, input.caseId],
    ),
  ]);

  return {
    evidencePackages: evidence.rows,
    exports: exports.rows,
  };
}

export async function generateCaseEvidencePackage(input: {
  principal: RequestPrincipal;
  caseId: string;
}): Promise<Record<string, unknown>> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const core = await loadFinalCase(
      client,
      input.principal.tenantId,
      input.caseId,
    );
    const history = await historyBundle(
      client,
      input.principal.tenantId,
      input.caseId,
      String(core.safetyCase.intakeRecordId),
    );

    const next = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(package_version), 0) + 1 AS next_version
         FROM safety_case_evidence_packages
        WHERE tenant_id = $1 AND case_id = $2`,
      [input.principal.tenantId, input.caseId],
    );
    const packageVersion = Number(next.rows[0].next_version);

    const packagePayload = JSON.parse(
      JSON.stringify({
        profile: "NEXUS_CASE_EVIDENCE_PACKAGE",
        schemaVersion: "1.0.0",
        generatedAt: new Date().toISOString(),
        case: core.safetyCase,
        finalCaseVersion: core.caseVersion,
        intake: core.intake,
        source: core.source,
        history,
        governance: {
          rawSourceDocumentBytesIncluded: false,
          caseVersionImmutable: true,
          systemSuggestionsSeparatedFromHumanDecisions: true,
        },
      }),
    ) as Record<string, unknown>;

    const manifest = {
      profile: "NEXUS_CASE_EVIDENCE_MANIFEST",
      packageVersion,
      caseId: input.caseId,
      caseVersionId: core.caseVersion.id,
      caseVersion: core.caseVersion.version,
      caseSha256: core.caseVersion.caseSha256,
      sourceSha256: core.source.sourceSha256,
      sourceLineageSha256: core.intake.sourceLineageSha256,
      counts: counts(history),
    };
    const packageSha256 = canonicalSha256(packagePayload);

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO safety_case_evidence_packages (
         tenant_id, case_id, case_version_id, package_version,
         manifest, package_payload, package_sha256, generated_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
       RETURNING id, case_version_id, package_version, manifest,
                 package_sha256, status, generated_at`,
      [
        input.principal.tenantId,
        input.caseId,
        String(core.caseVersion.id),
        packageVersion,
        JSON.stringify(manifest),
        JSON.stringify(packagePayload),
        packageSha256,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_EVIDENCE_PACKAGE_GENERATED',
         'NEXUS_CASE_EVIDENCE','success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          evidencePackageId: inserted.rows[0].id,
          packageVersion,
          packageSha256,
          caseVersionId: core.caseVersion.id,
        }),
      ],
    );

    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function humanReadableHtml(input: {
  safetyCase: Record<string, unknown>;
  caseVersion: Record<string, unknown>;
}): string {
  const payload = object(input.caseVersion.casePayload);
  const C = object(payload.C);
  const D = object(payload.D);
  const events = array(payload.E).map(object);
  const products = array(payload.G).map(object);
  const H = object(payload.H);

  const eventRows = events
    .map(
      (event) =>
        `<tr><td>${escapeHtml(event.reportedTerm)}</td><td>${escapeHtml(
          event.onsetDate,
        )}</td><td>${escapeHtml(event.outcome)}</td><td>${escapeHtml(
          event.seriousness,
        )}</td></tr>`,
    )
    .join("");

  const productRows = products
    .map(
      (product) =>
        `<tr><td>${escapeHtml(product.reportedName)}</td><td>${escapeHtml(
          product.roleCharacterization,
        )}</td><td>${escapeHtml(JSON.stringify(product.indication ?? {}))}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(input.safetyCase.caseKey)} Case Report</title>
<style>
body{font-family:Arial,sans-serif;max-width:980px;margin:32px auto;color:#172033;line-height:1.5}
h1,h2{color:#0f2747}table{width:100%;border-collapse:collapse;margin:12px 0 24px}
th,td{border:1px solid #ccd6e3;padding:8px;text-align:left;font-size:12px}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.meta div{border:1px solid #dbe4ef;padding:10px}
small{color:#64748b}.narrative{white-space:pre-wrap;border:1px solid #dbe4ef;padding:14px}
</style></head>
<body>
<h1>Individual Case Safety Report</h1>
<p><strong>Case:</strong> ${escapeHtml(input.safetyCase.caseKey)} · <strong>Version:</strong> ${escapeHtml(input.caseVersion.version)}</p>
<div class="meta">
<div><small>Report type</small><br>${escapeHtml(C.reportType)}</div>
<div><small>Country</small><br>${escapeHtml(C.countryCode)}</div>
<div><small>Seriousness</small><br>${escapeHtml(C.seriousnessStatus)}</div>
</div>
<h2>Patient</h2>
<p>${escapeHtml(D.patientReference)} · ${escapeHtml(D.sex)} · ${escapeHtml(D.ageValue)} ${escapeHtml(D.ageUnit)}</p>
<h2>Products</h2>
<table><thead><tr><th>Reported product</th><th>Role</th><th>Indication</th></tr></thead><tbody>${productRows}</tbody></table>
<h2>Events / Reactions</h2>
<table><thead><tr><th>Reported term</th><th>Onset</th><th>Outcome</th><th>Serious</th></tr></thead><tbody>${eventRows}</tbody></table>
<h2>Narrative</h2>
<div class="narrative">${escapeHtml(H.caseNarrative)}</div>
<h2>Integrity</h2>
<p><strong>Case SHA-256:</strong> ${escapeHtml(input.caseVersion.caseSha256)}</p>
<p><small>This is a human-readable Nexus case report, not a regulatory submission message.</small></p>
</body></html>`;
}

export async function generateCaseExport(input: {
  principal: RequestPrincipal;
  caseId: string;
  format: CaseExportFormat;
}): Promise<Record<string, unknown>> {
  if (!(CASE_EXPORT_FORMATS as readonly string[]).includes(input.format)) {
    throw new Error("Unsupported case export format.");
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const core = await loadFinalCase(
      client,
      input.principal.tenantId,
      input.caseId,
    );

    const evidence = await client.query<{ id: string }>(
      `SELECT id FROM safety_case_evidence_packages
        WHERE tenant_id = $1 AND case_id = $2 AND case_version_id = $3
          AND status = 'GENERATED'
        ORDER BY package_version DESC LIMIT 1`,
      [
        input.principal.tenantId,
        input.caseId,
        String(core.caseVersion.id),
      ],
    );

    const next = await client.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(export_version), 0) + 1 AS next_version
         FROM safety_case_exports
        WHERE tenant_id = $1 AND case_id = $2 AND export_format = $3`,
      [input.principal.tenantId, input.caseId, input.format],
    );
    const exportVersion = Number(next.rows[0].next_version);

    let payloadJson: Record<string, unknown> | null = null;
    let contentText: string | null = null;

    if (input.format === "NEXUS_CASE_JSON") {
      payloadJson = {
        profile: "NEXUS_CASE_EXPORT",
        schemaVersion: "1.0.0",
        generatedAt: new Date().toISOString(),
        case: core.safetyCase,
        caseVersion: core.caseVersion,
      };
    }

    if (input.format === "E2B_R3_MAPPING_JSON") {
      payloadJson = {
        profile: "ICH_E2B_R3_MAPPING",
        implementationPackageReference: "ICH E2B(R3)",
        transmissionReady: false,
        note:
          "This is a Nexus E2B(R3)-aware mapping representation. It is not XML and is not a regulatory gateway submission message.",
        generatedAt: new Date().toISOString(),
        casePayload: core.caseVersion.casePayload,
        caseSha256: core.caseVersion.caseSha256,
      };
    }

    if (input.format === "HUMAN_READABLE_HTML") {
      contentText = humanReadableHtml({
        safetyCase: core.safetyCase,
        caseVersion: core.caseVersion,
      });
    }

    const contentSha256 = payloadJson
      ? canonicalSha256(payloadJson)
      : createHash("sha256").update(contentText ?? "", "utf8").digest("hex");

    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO safety_case_exports (
         tenant_id, case_id, case_version_id, evidence_package_id,
         export_format, export_version, payload_json, content_text,
         content_sha256, generated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
       RETURNING id, case_version_id, evidence_package_id, export_format,
                 export_version, content_sha256, generated_at`,
      [
        input.principal.tenantId,
        input.caseId,
        String(core.caseVersion.id),
        evidence.rows[0]?.id ?? null,
        input.format,
        exportVersion,
        payloadJson ? JSON.stringify(payloadJson) : null,
        contentText,
        contentSha256,
        input.principal.userId,
      ],
    );

    await client.query(
      `INSERT INTO audit_events (
         tenant_id, actor_id, event_type, event_category, outcome, details
       ) VALUES (
         $1,$2,'CASE_EXPORT_GENERATED','NEXUS_CASE_EXPORT',
         'success',$3::jsonb
       )`,
      [
        input.principal.tenantId,
        input.principal.userId,
        JSON.stringify({
          caseId: input.caseId,
          exportId: inserted.rows[0].id,
          exportFormat: input.format,
          exportVersion,
          contentSha256,
        }),
      ],
    );

    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getEvidencePackagePayload(input: {
  principal: RequestPrincipal;
  caseId: string;
  packageId: string;
}): Promise<{ payload: Record<string, unknown>; sha256: string }> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT package_payload, package_sha256
       FROM safety_case_evidence_packages
      WHERE tenant_id = $1 AND case_id = $2 AND id = $3
        AND status = 'GENERATED'
      LIMIT 1`,
    [input.principal.tenantId, input.caseId, input.packageId],
  );
  if (!result.rows[0]) throw new Error("Case evidence package was not found.");
  return {
    payload: object(result.rows[0].package_payload),
    sha256: String(result.rows[0].package_sha256),
  };
}

export async function getCaseExportContent(input: {
  principal: RequestPrincipal;
  caseId: string;
  exportId: string;
}): Promise<{
  format: CaseExportFormat;
  payloadJson: Record<string, unknown> | null;
  contentText: string | null;
  sha256: string;
}> {
  const result = await getPostgresPool().query<Record<string, unknown>>(
    `SELECT export_format, payload_json, content_text, content_sha256
       FROM safety_case_exports
      WHERE tenant_id = $1 AND case_id = $2 AND id = $3
      LIMIT 1`,
    [input.principal.tenantId, input.caseId, input.exportId],
  );
  if (!result.rows[0]) throw new Error("Case export was not found.");

  return {
    format: String(result.rows[0].export_format) as CaseExportFormat,
    payloadJson: result.rows[0].payload_json
      ? object(result.rows[0].payload_json)
      : null,
    contentText:
      typeof result.rows[0].content_text === "string"
        ? result.rows[0].content_text
        : null,
    sha256: String(result.rows[0].content_sha256),
  };
}
