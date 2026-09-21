import "server-only";

import { resolveActiveConfigurations } from "@/lib/configuration/active-resolver";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsFromPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload.records)) {
    return payload.records.filter(isRecord);
  }
  return [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : typeof value === "string"
      ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
      : [];
}

export type ReviewReferenceUsageScope = "PRODUCTION" | "VALIDATION_ONLY";

export interface ActiveLabelReference {
  configurationVersionId: string;
  configurationKey: string;
  configurationVersion: string;
  labelKey: string;
  clientProductId: string;
  country: string;
  labelType: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  eventTerms: string[];
  sourceDocument?: string;
  usageScope: ReviewReferenceUsageScope;
}

export interface ActiveCausalityMethod {
  configurationVersionId: string;
  configurationKey: string;
  configurationVersion: string;
  methodKey: string;
  methodName: string;
  version: string;
  allowedConclusions: string[];
  methodology?: string;
  usageScope: ReviewReferenceUsageScope;
}

export async function activeReviewReferenceData(tenantId: string): Promise<{
  labelReferences: ActiveLabelReference[];
  causalityMethods: ActiveCausalityMethod[];
}> {
  const active = await resolveActiveConfigurations(tenantId);

  const labelReferences = active.labelReferences.flatMap((configuration) => {
    const payloadScope: ReviewReferenceUsageScope =
      isRecord(configuration.payload) &&
      configuration.payload.usageScope === "VALIDATION_ONLY"
        ? "VALIDATION_ONLY"
        : "PRODUCTION";
    return recordsFromPayload(configuration.payload).map((record) => ({
      configurationVersionId: configuration.id,
      configurationKey: configuration.configKey,
      configurationVersion: configuration.versionLabel,
      labelKey: text(record.labelKey || record.referenceLabelKey),
      clientProductId: text(record.clientProductId || record.productId),
      country: text(record.country || record.market),
      labelType: text(record.labelType || record.referenceType),
      version: text(record.version || record.labelVersion),
      effectiveFrom: text(record.effectiveFrom || record.labelEffectiveFrom),
      effectiveTo: text(record.effectiveTo || record.labelEffectiveTo) || undefined,
      eventTerms: stringList(record.eventTerms),
      sourceDocument: text(record.sourceDocument || record.sourceFilename) || undefined,
      usageScope: (
        record.usageScope === "VALIDATION_ONLY"
          ? "VALIDATION_ONLY"
          : payloadScope
      ) as ReviewReferenceUsageScope,
    })).filter((record) =>
      Boolean(
        record.labelKey &&
          record.clientProductId &&
          record.country &&
          record.labelType &&
          record.version &&
          record.effectiveFrom,
      ),
    );
  });

  const causalityMethods = active.causalityMethods.flatMap((configuration) => {
    const payloadScope =
      isRecord(configuration.payload) &&
      configuration.payload.usageScope === "VALIDATION_ONLY"
        ? "VALIDATION_ONLY"
        : "PRODUCTION";
    return recordsFromPayload(configuration.payload).map((record) => ({
      configurationVersionId: configuration.id,
      configurationKey: configuration.configKey,
      configurationVersion: configuration.versionLabel,
      methodKey: text(record.methodKey),
      methodName: text(record.methodName || record.name),
      version: text(record.version || record.methodVersion),
      allowedConclusions: stringList(record.allowedConclusions).map((value) =>
        value.toUpperCase(),
      ),
      methodology: text(record.methodology || record.description) || undefined,
      usageScope:
        record.usageScope === "VALIDATION_ONLY"
          ? "VALIDATION_ONLY"
          : payloadScope,
    })).filter((record) =>
      Boolean(
        record.methodKey &&
          record.methodName &&
          record.version &&
          record.allowedConclusions.length,
      ),
    );
  });

  return { labelReferences, causalityMethods };
}

function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function expectednessFromReference(input: {
  clinicalEvent: string;
  reference: ActiveLabelReference;
}): "EXPECTED" | "UNEXPECTED" {
  const event = normalizeTerm(input.clinicalEvent);
  const configured = input.reference.eventTerms.map(normalizeTerm).filter(Boolean);
  return configured.includes(event) ? "EXPECTED" : "UNEXPECTED";
}
