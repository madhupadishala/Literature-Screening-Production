import { canonicalSha256 } from "../common/canonical-json";
import { isSafetySourceType, type IntakeDraft } from "../common/safety-types";
import { validateIntakeDraft } from "../common/safety-validation";
import type { StructuredIntakeSubmission } from "./source-submission-types";

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function safeKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function structuredSubmissionToIntakeDraft(
  submission: StructuredIntakeSubmission,
): IntakeDraft {
  const idempotencyKey = requiredText(submission.idempotencyKey, "idempotencyKey");
  const sourceSystem = requiredText(submission.sourceSystem, "sourceSystem");
  if (!isSafetySourceType(submission.sourceType)) {
    throw new Error("A valid sourceType is required.");
  }
  const receivedAt = requiredText(submission.receivedAt, "receivedAt");
  if (!Number.isFinite(new Date(receivedAt).getTime())) {
    throw new Error("receivedAt must be a valid ISO date/time.");
  }

  const stableIdentity = {
    sourceSystem,
    intakeChannel: submission.intakeChannel,
    idempotencyKey,
  };
  const stableHash = canonicalSha256(stableIdentity);
  const normalizedId = safeKey(idempotencyKey) || stableHash.slice(0, 20);

  const sourcePayload = submission.sourcePayload ?? {};
  const normalizedSource = {
    sourceType: submission.sourceType,
    sourceSystem,
    externalReference: submission.externalReference ?? null,
    receivedAt,
    countryCode: submission.countryCode ?? null,
    languageCode: submission.languageCode ?? null,
    payload: sourcePayload,
  };

  const lineage = {
    sourceSystem,
    sourceRecordType:
      submission.intakeChannel === "MANUAL"
        ? "MANUAL_INTAKE_SUBMISSION"
        : "API_INTAKE_SUBMISSION",
    sourceRecordId: idempotencyKey,
  };

  const draft: IntakeDraft = {
    source: {
      sourceKey: `${submission.intakeChannel.toLowerCase()}:${stableHash}`,
      sourceType: submission.sourceType,
      sourceSystem,
      externalReference: submission.externalReference,
      receivedAt,
      countryCode: submission.countryCode,
      languageCode: submission.languageCode,
      sourcePayload,
      sourceSha256: canonicalSha256({
        source: normalizedSource,
        intakePayload: submission.intakePayload ?? {},
        patients: submission.patients ?? [],
        reporters: submission.reporters ?? [],
        products: submission.products ?? [],
        events: submission.events ?? [],
        tests: submission.tests ?? [],
      }),
    },
    intake: {
      intakeKey: `${submission.intakeChannel === "MANUAL" ? "MAN" : "API"}-${normalizedId}-${stableHash.slice(0, 8)}`,
      sourceRecordKey: idempotencyKey,
      intakeChannel: submission.intakeChannel,
      status: "RECEIVED",
      initialReceiptDate: submission.initialReceiptDate,
      latestReceiptDate: submission.latestReceiptDate,
      countryCode: submission.countryCode,
      languageCode: submission.languageCode,
      payload: submission.intakePayload ?? {},
      lineage,
      lineageSha256: canonicalSha256(lineage),
    },
    patients: submission.patients ?? [],
    reporters: submission.reporters ?? [],
    products: submission.products ?? [],
    events: submission.events ?? [],
    tests: submission.tests ?? [],
  };

  return validateIntakeDraft(draft);
}
