import { createHash } from "node:crypto";

import { canonicalSha256 } from "../common/canonical-json";
import type { IntakeDraft } from "../common/safety-types";
import { validateIntakeDraft } from "../common/safety-validation";
import {
  isIntakeDocumentContentType,
  type DocumentIntakeSubmission,
} from "./source-submission-types";

export const MAX_INTAKE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface NormalizedDocumentIntake {
  draft: IntakeDraft;
  bytes: Buffer;
  contentSha256: string;
  documentKey: string;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function decodeBase64(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) throw new Error("contentBase64 is required.");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error("contentBase64 is not valid base64.");
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) throw new Error("Document content is empty.");
  if (bytes.length > MAX_INTAKE_DOCUMENT_BYTES) {
    throw new Error("Document exceeds the 10 MB Sprint 3 intake limit.");
  }
  return bytes;
}

export function documentSubmissionToIntakeDraft(
  submission: DocumentIntakeSubmission,
): NormalizedDocumentIntake {
  const requestId = requiredText(submission.requestId, "requestId");
  const fileName = requiredText(submission.fileName, "fileName");
  if (!isIntakeDocumentContentType(submission.contentType)) {
    throw new Error("Unsupported document contentType.");
  }
  const receivedAt = requiredText(submission.receivedAt, "receivedAt");
  if (!Number.isFinite(new Date(receivedAt).getTime())) {
    throw new Error("receivedAt must be a valid ISO date/time.");
  }

  const bytes = decodeBase64(submission.contentBase64);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceIdentity = {
    channel: "DOCUMENT",
    requestId,
  };
  const sourceIdentityHash = canonicalSha256(sourceIdentity);
  const lineage = {
    sourceSystem: "NEXUS_DOCUMENT_INTAKE",
    sourceRecordType: "SOURCE_DOCUMENT",
    sourceRecordId: requestId,
    sourceSha256: contentSha256,
  };

  const draft: IntakeDraft = {
    source: {
      sourceKey: `document:${sourceIdentityHash}`,
      sourceType: submission.sourceType,
      sourceSystem: "NEXUS_DOCUMENT_INTAKE",
      externalReference: submission.externalReference,
      receivedAt,
      countryCode: submission.countryCode,
      languageCode: submission.languageCode,
      sourcePayload: {
        fileName,
        contentType: submission.contentType,
        sizeBytes: bytes.length,
        contentSha256,
        metadata: submission.metadata ?? {},
      },
      sourceSha256: contentSha256,
    },
    intake: {
      intakeKey: `DOC-${sourceIdentityHash.slice(0, 20)}`,
      sourceRecordKey: requestId,
      intakeChannel: "DOCUMENT",
      status: "RECEIVED",
      initialReceiptDate: submission.initialReceiptDate,
      latestReceiptDate: submission.latestReceiptDate,
      countryCode: submission.countryCode,
      languageCode: submission.languageCode,
      payload: {
        document: {
          fileName,
          contentType: submission.contentType,
          sizeBytes: bytes.length,
          contentSha256,
          extractionStatus: "PENDING",
        },
      },
      lineage,
      lineageSha256: canonicalSha256(lineage),
    },
    patients: [],
    reporters: [],
    products: [],
    events: [],
    tests: [],
  };

  return {
    draft: validateIntakeDraft(draft),
    bytes,
    contentSha256,
    documentKey: `source-document:${sourceIdentityHash}:${contentSha256.slice(0, 16)}`,
  };
}
