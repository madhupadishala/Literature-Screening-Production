import "server-only";

import { resolveActiveConfigurations } from "@/lib/configuration/active-resolver";
import type {
  AdHocSearchCriteria,
  ResolvedProductContext,
} from "@/lib/literature/adhoc-search/types";

function recordArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> =>
        Boolean(value) && typeof value === "object" && !Array.isArray(value),
    );
  }

  if (
    payload &&
    typeof payload === "object" &&
    "records" in payload &&
    Array.isArray((payload as { records: unknown }).records)
  ) {
    return recordArray((payload as { records: unknown }).records);
  }

  return [];
}

function value(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const raw = record[key];
    if (raw !== undefined && raw !== null && String(raw).trim()) {
      return String(raw).trim();
    }
  }
  return "";
}

function listValue(
  record: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const raw = record[key];

    if (Array.isArray(raw)) {
      return raw.map(String).map((item) => item.trim()).filter(Boolean);
    }

    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/[|;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function equals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function resolveProductContext(input: {
  tenantId: string;
  criteria: AdHocSearchCriteria;
}): Promise<ResolvedProductContext> {
  const active = await resolveActiveConfigurations(input.tenantId);
  const records = recordArray(active.productMaster?.payload);

  const requestedProductId = String(input.criteria.productId || "").trim();
  const requestedWhoDrugId = String(input.criteria.whodrugId || "").trim();
  const requestedProduct = String(input.criteria.product || "").trim();

  const matchedRecord = records.find((record) => {
    const productId = value(record, [
      "clientProductId",
      "productId",
      "client_product_id",
      "product_id",
    ]);
    const whodrugId = value(record, [
      "whodrugId",
      "whoDrugId",
      "whodrug_id",
      "who_drug_id",
    ]);

    const names = [
      value(record, ["brandName", "brand_name"]),
      value(record, ["genericName", "generic_name"]),
      value(record, ["inn", "INN"]),
      value(record, ["api", "API"]),
      ...listValue(record, ["synonyms", "productSynonyms"]),
      ...listValue(record, ["saltForms", "salts", "salt_forms"]),
    ].filter(Boolean);

    if (requestedProductId && equals(productId, requestedProductId)) return true;
    if (requestedWhoDrugId && equals(whodrugId, requestedWhoDrugId)) return true;
    if (
      requestedProduct &&
      names.some((name) => equals(name, requestedProduct))
    ) {
      return true;
    }

    return false;
  });

  if (!matchedRecord && (requestedProductId || requestedWhoDrugId)) {
    throw new Error(
      "The supplied Product ID or WHODrug ID was not found in the active tenant Product Master.",
    );
  }

  if (!matchedRecord) {
    return {
      matched: false,
      preferredName: requestedProduct || undefined,
      productId: requestedProductId || undefined,
      whodrugId: requestedWhoDrugId || undefined,
      searchTerms: requestedProduct ? [requestedProduct] : [],
    };
  }

  const productId = value(matchedRecord, [
    "clientProductId",
    "productId",
    "client_product_id",
    "product_id",
  ]);
  const whodrugId = value(matchedRecord, [
    "whodrugId",
    "whoDrugId",
    "whodrug_id",
    "who_drug_id",
  ]);
  const preferredName =
    value(matchedRecord, ["brandName", "brand_name"]) ||
    value(matchedRecord, ["genericName", "generic_name"]) ||
    value(matchedRecord, ["inn", "INN"]) ||
    value(matchedRecord, ["api", "API"]);

  const terms = [
    requestedProduct,
    preferredName,
    value(matchedRecord, ["genericName", "generic_name"]),
    value(matchedRecord, ["inn", "INN"]),
    value(matchedRecord, ["api", "API"]),
    ...listValue(matchedRecord, ["synonyms", "productSynonyms"]),
    ...listValue(matchedRecord, ["saltForms", "salts", "salt_forms"]),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    matched: true,
    productId: productId || requestedProductId || undefined,
    whodrugId: whodrugId || requestedWhoDrugId || undefined,
    preferredName: preferredName || requestedProduct || undefined,
    searchTerms: [...new Set(terms)],
    sourceRecord: matchedRecord,
  };
}
