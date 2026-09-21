import "server-only";

import { getPostgresPool } from "@/lib/database/postgres";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import {
  ingestSafetyIntakeDraft,
  persistSafetyIntakeDraftInTransaction,
  type SafetyIntakeSummary,
} from "../common/safety-backbone-service";
import { isSafetySourceType } from "../common/safety-types";
import {
  documentSubmissionToIntakeDraft,
  type NormalizedDocumentIntake,
} from "./document-intake-adapter";
import type {
  ApiIntakeSubmission,
  DocumentIntakeSubmission,
  ManualIntakeSubmission,
  StructuredIntakeSubmission,
} from "./source-submission-types";
import { structuredSubmissionToIntakeDraft } from "./structured-intake-adapter";

export interface IntakeDocumentSummary {
  documentId: string;
  documentKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  contentSha256: string;
  extractionStatus: string;
  createdAt: string;
}

export interface DocumentIntakeResult {
  intake: SafetyIntakeSummary;
  document: IntakeDocumentSummary;
}

function requireReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 10) {
    throw new Error("An intake reason of at least 10 characters is required.");
  }
  return reason;
}

function validateSourceType(value: string): void {
  if (!isSafetySourceType(value)) throw new Error("A valid sourceType is required.");
  if (value === "LITERATURE") {
    throw new Error(
      "LITERATURE must use the governed Literature-to-Intake handoff.",
    );
  }
}

function toStructuredManual(
  submission: ManualIntakeSubmission,
): StructuredIntakeSubmission {
  validateSourceType(submission.sourceType);
  return {
    ...submission,
    sourceSystem: "NEXUS_MANUAL",
    intakeChannel: "MANUAL",
  };
}

function toStructuredApi(
  submission: ApiIntakeSubmission,
): StructuredIntakeSubmission {
  validateSourceType(submission.sourceType);
  return {
    ...submission,
    intakeChannel: "API",
  };
}

export async function ingestManualIntake(input: {
  principal: RequestPrincipal;
  submission: ManualIntakeSubmission;
  reason: string;
}): Promise<SafetyIntakeSummary> {
  const reason = requireReason(input.reason);
  const draft = structuredSubmissionToIntakeDraft(
    toStructuredManual(input.submission),
  );

  return ingestSafetyIntakeDraft({
    principal: input.principal,
    draft,
    reason,
  });
}

export async function ingestApiIntake(input: {
  principal: RequestPrincipal;
  submission: ApiIntakeSubmission;
  reason: string;
}): Promise<SafetyIntakeSummary> {
  const reason = requireReason(input.reason);
  const draft = structuredSubmissionToIntakeDraft(
    toStructuredApi(input.submission),
  );

  return ingestSafetyIntakeDraft({
    principal: input.principal,
    draft,
    reason,
  });
}

async function storeDocument(input: {
  principal: RequestPrincipal;
  normalized: NormalizedDocumentIntake;
  intake: SafetyIntakeSummary;
  client: Awaited<ReturnType<typeof getPostgresPool>["connect"]>;
}): Promise<IntakeDocumentSummary> {
  const inserted = await input.client.query<{
    id: string;
    document_key: string;
    file_name: string;
    content_type: string;
    size_bytes: string | number;
    content_sha256: string;
    extraction_status: string;
    created_at: string;
  }>(
    `INSERT INTO safety_source_documents (
       tenant_id, source_id, intake_record_id, document_key,
       file_name, content_type, size_bytes, content_sha256,
       content_bytes, original_metadata, extraction_status, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'PENDING',$11
     )
     ON CONFLICT (tenant_id, document_key)
     DO UPDATE SET document_key = safety_source_documents.document_key
     RETURNING id, document_key, file_name, content_type, size_bytes,
               content_sha256, extraction_status, created_at::text`,
    [
      input.principal.tenantId,
      input.intake.sourceId,
      input.intake.intakeRecordId,
      input.normalized.documentKey,
      String(input.normalized.draft.source.sourcePayload.fileName),
      String(input.normalized.draft.source.sourcePayload.contentType),
      input.normalized.bytes.length,
      input.normalized.contentSha256,
      input.normalized.bytes,
      JSON.stringify(
        input.normalized.draft.source.sourcePayload.metadata ?? {},
      ),
      input.principal.userId,
    ],
  );

  const row = inserted.rows[0];
  if (!row) throw new Error("Source document could not be persisted.");

  if (row.content_sha256 !== input.normalized.contentSha256) {
    throw new Error("Document identity was reused with different content.");
  }

  await input.client.query(
    `INSERT INTO safety_evidence_links (
       tenant_id, source_id, intake_record_id, link_type,
       source_locator, evidence_sha256, metadata, created_by
     )
     SELECT $1,$2,$3,'SOURCE_DOCUMENT',$4::jsonb,$5,$6::jsonb,$7
     WHERE NOT EXISTS (
       SELECT 1
         FROM safety_evidence_links
        WHERE tenant_id = $1
          AND intake_record_id = $3
          AND link_type = 'SOURCE_DOCUMENT'
          AND evidence_sha256 = $5
     )`,
    [
      input.principal.tenantId,
      input.intake.sourceId,
      input.intake.intakeRecordId,
      JSON.stringify({
        documentId: row.id,
        documentKey: row.document_key,
        fileName: row.file_name,
      }),
      row.content_sha256,
      JSON.stringify({
        contentType: row.content_type,
        sizeBytes: Number(row.size_bytes),
        extractionStatus: row.extraction_status,
      }),
      input.principal.userId,
    ],
  );

  return {
    documentId: row.id,
    documentKey: row.document_key,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    contentSha256: row.content_sha256,
    extractionStatus: row.extraction_status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function ingestDocumentIntake(input: {
  principal: RequestPrincipal;
  submission: DocumentIntakeSubmission;
  reason: string;
}): Promise<DocumentIntakeResult> {
  validateSourceType(input.submission.sourceType);
  const reason = requireReason(input.reason);
  const normalized = documentSubmissionToIntakeDraft(input.submission);

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");

    const intake = await persistSafetyIntakeDraftInTransaction({
      client,
      principal: input.principal,
      draft: normalized.draft,
      reason,
    });

    const document = await storeDocument({
      principal: input.principal,
      normalized,
      intake,
      client,
    });

    if (!intake.reused) {
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, actor_id, event_type, event_category, outcome, details
         ) VALUES ($1,$2,'SAFETY_SOURCE_DOCUMENT_STORED',
           'NEXUS_SAFETY_INTAKE','success',$3::jsonb)`,
        [
          input.principal.tenantId,
          input.principal.userId,
          JSON.stringify({
            intakeRecordId: intake.intakeRecordId,
            documentId: document.documentId,
            documentKey: document.documentKey,
            fileName: document.fileName,
            contentType: document.contentType,
            sizeBytes: document.sizeBytes,
            contentSha256: document.contentSha256,
            reason,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    return { intake, document };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
