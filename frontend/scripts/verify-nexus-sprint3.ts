import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { documentSubmissionToIntakeDraft } from "../lib/safety/intake/document-intake-adapter";
import { structuredSubmissionToIntakeDraft } from "../lib/safety/intake/structured-intake-adapter";
import {
  INTAKE_DOCUMENT_CONTENT_TYPES,
} from "../lib/safety/intake/source-submission-types";
import {
  SAFETY_SOURCE_TYPES,
  isSafetySourceType,
} from "../lib/safety/common/safety-types";
import { validateIntakeDraft } from "../lib/safety/common/safety-validation";

const migration = readFileSync(
  path.join(process.cwd(), "database/migrations/023_nexus_intake_sources.sql"),
  "utf8",
);
assert.equal(
  migration.split("CREATE TABLE IF NOT EXISTS safety_source_documents").length - 1,
  1,
);
assert.equal(migration.includes("content_bytes bytea NOT NULL"), true);
assert.equal(migration.includes("size_bytes > 0 AND size_bytes <= 10485760"), true);

for (const contentType of INTAKE_DOCUMENT_CONTENT_TYPES) {
  assert.equal(migration.includes(`'${contentType}'`), true);
}

assert.equal(isSafetySourceType("SPONTANEOUS"), true);
assert.equal(isSafetySourceType("NOT_REAL"), false);
assert.equal(SAFETY_SOURCE_TYPES.includes("LITERATURE"), true);

const baseStructured = {
  idempotencyKey: "manual-req-001",
  sourceType: "SPONTANEOUS" as const,
  sourceSystem: "NEXUS_MANUAL",
  intakeChannel: "MANUAL" as const,
  receivedAt: "2026-09-22T00:00:00.000Z",
  countryCode: "IN",
  languageCode: "en",
  initialReceiptDate: "2026-09-22",
  latestReceiptDate: "2026-09-22",
  patients: [
    {
      patientKey: "patient-1",
      sex: "FEMALE" as const,
      ageValue: 45,
      ageUnit: "year",
    },
  ],
  reporters: [
    {
      reporterKey: "reporter-1",
      primarySource: true,
      qualification: "Physician",
      countryCode: "IN",
    },
  ],
  products: [
    {
      productKey: "product-1",
      reportedName: "Example Drug",
      roleCharacterization: "SUSPECT" as const,
    },
  ],
  events: [
    {
      eventKey: "event-1",
      reportedTerm: "Headache",
      countryCode: "IN",
    },
  ],
  tests: [],
  sourcePayload: {
    narrative: "Patient developed headache after Example Drug.",
  },
  intakePayload: {
    sourceForm: "manual",
  },
};

const manual = structuredSubmissionToIntakeDraft(baseStructured);
assert.equal(manual.source.sourceSystem, "NEXUS_MANUAL");
assert.equal(manual.intake.intakeChannel, "MANUAL");
assert.equal(manual.patients.length, 1);
assert.equal(manual.reporters.length, 1);
assert.equal(manual.products.length, 1);
assert.equal(manual.events.length, 1);

const repeatManual = structuredSubmissionToIntakeDraft({
  ...baseStructured,
  sourcePayload: {
    narrative: "Patient developed headache after Example Drug.",
  },
});
assert.equal(repeatManual.source.sourceKey, manual.source.sourceKey);
assert.equal(repeatManual.source.sourceSha256, manual.source.sourceSha256);

const changedManual = structuredSubmissionToIntakeDraft({
  ...baseStructured,
  events: [
    {
      eventKey: "event-1",
      reportedTerm: "Nausea",
      countryCode: "IN",
    },
  ],
});
assert.equal(changedManual.source.sourceKey, manual.source.sourceKey);
assert.notEqual(changedManual.source.sourceSha256, manual.source.sourceSha256);

const api = structuredSubmissionToIntakeDraft({
  ...baseStructured,
  idempotencyKey: "partner-msg-8842",
  sourceSystem: "PARTNER_GATEWAY",
  intakeChannel: "API",
});
assert.equal(api.intake.intakeChannel, "API");
assert.equal(api.source.sourceSystem, "PARTNER_GATEWAY");
assert.equal(api.intake.intakeKey.startsWith("API-"), true);

const documentContent = Buffer.from("synthetic source document", "utf8");
const document = documentSubmissionToIntakeDraft({
  requestId: "document-request-1",
  sourceType: "SPONTANEOUS",
  receivedAt: "2026-09-22T00:00:00.000Z",
  fileName: "source.txt",
  contentType: "text/plain",
  contentBase64: documentContent.toString("base64"),
  countryCode: "IN",
  languageCode: "en",
});
assert.equal(document.draft.intake.intakeChannel, "DOCUMENT");
assert.equal(document.draft.patients.length, 0);
assert.equal(document.draft.intake.payload.document instanceof Object, true);
assert.equal(document.bytes.toString("utf8"), "synthetic source document");
assert.equal(document.contentSha256.length, 64);

const changedDocument = documentSubmissionToIntakeDraft({
  requestId: "document-request-1",
  sourceType: "SPONTANEOUS",
  receivedAt: "2026-09-22T00:00:00.000Z",
  fileName: "source.txt",
  contentType: "text/plain",
  contentBase64: Buffer.from("different content", "utf8").toString("base64"),
});
assert.equal(changedDocument.draft.source.sourceKey, document.draft.source.sourceKey);
assert.notEqual(
  changedDocument.draft.source.sourceSha256,
  document.draft.source.sourceSha256,
);

assert.throws(
  () =>
    documentSubmissionToIntakeDraft({
      requestId: "bad-base64",
      sourceType: "SPONTANEOUS",
      receivedAt: "2026-09-22T00:00:00.000Z",
      fileName: "source.txt",
      contentType: "text/plain",
      contentBase64: "not base64!",
    }),
  /not valid base64/,
);

assert.throws(
  () =>
    documentSubmissionToIntakeDraft({
      requestId: "bad-mime",
      sourceType: "SPONTANEOUS",
      receivedAt: "2026-09-22T00:00:00.000Z",
      fileName: "source.exe",
      contentType: "application/x-msdownload" as "text/plain",
      contentBase64: Buffer.from("x").toString("base64"),
    }),
  /Unsupported document contentType/,
);

assert.throws(
  () =>
    validateIntakeDraft({
      ...manual,
      intake: {
        ...manual.intake,
        initialReceiptDate: "2026-09-22",
        latestReceiptDate: "2026-09-21",
      },
    }),
  /cannot precede/,
);

for (const route of [
  "app/api/safety/intake/manual/route.ts",
  "app/api/safety/intake/external/route.ts",
  "app/api/safety/intake/document/route.ts",
  "app/api/safety/intake/literature/route.ts",
]) {
  const source = readFileSync(path.join(process.cwd(), route), "utf8");
  assert.equal(source.includes("NEXUS_MODULES.INTAKE"), true, route);
  assert.equal(source.includes("PERMISSIONS.INTAKE_CREATE"), true, route);
  assert.equal(source.includes("documentManager"), false, route);
}

console.log("Nexus Sprint 3 canonical intake source verification passed.");
