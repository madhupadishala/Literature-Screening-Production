import type {
  E2BR3CasePayload,
  IntakeDraft,
  SafetyEventDraft,
  SafetyProductDraft,
} from "./safety-types";
import {
  E2B_PROFILE,
  SAFETY_BACKBONE_SCHEMA_VERSION,
} from "./safety-types";

const COUNTRY_CODE = /^[A-Z]{2}$/;
const LANGUAGE_CODE = /^[a-z]{2}(-[A-Z]{2})?$/;

export function assertIsoCountryCode(
  value: string | undefined,
  fieldName: string,
): void {
  if (value && !COUNTRY_CODE.test(value)) {
    throw new Error(`${fieldName} must be an ISO 3166-1 alpha-2 country code.`);
  }
}

export function assertLanguageCode(
  value: string | undefined,
  fieldName: string,
): void {
  if (value && !LANGUAGE_CODE.test(value)) {
    throw new Error(`${fieldName} must be a normalized language code.`);
  }
}

function assertUniqueKeys(
  label: string,
  values: Array<{ [key: string]: unknown }>,
  key: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const current = String(value[key] || "").trim();
    if (!current) throw new Error(`${label} requires ${key}.`);
    if (seen.has(current)) throw new Error(`Duplicate ${label} key: ${current}.`);
    seen.add(current);
  }
}

function assertProduct(product: SafetyProductDraft): void {
  if (!product.reportedName.trim()) throw new Error("Product reportedName is required.");
}

function assertEvent(event: SafetyEventDraft): void {
  if (!event.reportedTerm.trim()) throw new Error("Event reportedTerm is required.");
  if (event.onsetDate && event.endDate) {
    if (new Date(event.endDate).getTime() < new Date(event.onsetDate).getTime()) {
      throw new Error(`Event ${event.eventKey} endDate cannot precede onsetDate.`);
    }
  }
}

export function validateIntakeDraft(draft: IntakeDraft): IntakeDraft {
  if (!draft.source.sourceKey.trim()) throw new Error("sourceKey is required.");
  if (!draft.source.sourceSystem.trim()) throw new Error("sourceSystem is required.");
  if (!draft.source.sourceSha256.trim()) throw new Error("sourceSha256 is required.");
  if (!draft.intake.intakeKey.trim()) throw new Error("intakeKey is required.");
  if (!draft.intake.sourceRecordKey.trim()) throw new Error("sourceRecordKey is required.");
  if (!draft.intake.lineageSha256.trim()) throw new Error("lineageSha256 is required.");

  assertIsoCountryCode(draft.source.countryCode, "source.countryCode");
  assertIsoCountryCode(draft.intake.countryCode, "intake.countryCode");
  assertLanguageCode(draft.source.languageCode, "source.languageCode");
  assertLanguageCode(draft.intake.languageCode, "intake.languageCode");

  assertUniqueKeys("patient", draft.patients, "patientKey");
  assertUniqueKeys("reporter", draft.reporters, "reporterKey");
  assertUniqueKeys("product", draft.products, "productKey");
  assertUniqueKeys("event", draft.events, "eventKey");
  assertUniqueKeys("test", draft.tests, "testKey");

  draft.products.forEach(assertProduct);
  draft.events.forEach(assertEvent);

  return draft;
}

export function validateE2BR3CasePayload(
  payload: E2BR3CasePayload,
): E2BR3CasePayload {
  if (payload.profile !== E2B_PROFILE) {
    throw new Error(`Case payload profile must be ${E2B_PROFILE}.`);
  }
  if (payload.schemaVersion !== SAFETY_BACKBONE_SCHEMA_VERSION) {
    throw new Error(
      `Case payload schemaVersion must be ${SAFETY_BACKBONE_SCHEMA_VERSION}.`,
    );
  }
  if (!payload.nexus.caseId || !payload.nexus.intakeRecordId) {
    throw new Error("Case payload Nexus lineage is incomplete.");
  }
  if (!Array.isArray(payload.E) || !Array.isArray(payload.F) || !Array.isArray(payload.G)) {
    throw new Error("E2B R3 sections E, F and G must be arrays.");
  }
  return payload;
}
