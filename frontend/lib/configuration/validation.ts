import {
  type ConfigurationResourceType,
  type ConfigurationValidationIssue,
  type ConfigurationValidationReport,
} from "@/lib/configuration/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.records)) return payload.records;
  return [];
}

function issue(
  severity: "error" | "warning",
  path: string,
  message: string,
): ConfigurationValidationIssue {
  return { severity, path, message };
}

export function validateConfigurationPayload(
  resourceType: ConfigurationResourceType,
  payload: unknown,
): ConfigurationValidationReport {
  const errors: ConfigurationValidationIssue[] = [];
  const warnings: ConfigurationValidationIssue[] = [];

  if (resourceType === "PRODUCT_MASTER") {
    const records = recordsFromPayload(payload);

    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Product Master must contain at least one product record.",
        ),
      );
    }

    records.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(
          issue("error", `records[${index}]`, "Product row must be an object."),
        );
        return;
      }

      const hasIdentity = [
        value.clientProductId,
        value.productId,
        value.brandName,
        value.genericName,
        value.inn,
        value.api,
        value.whodrugId,
      ].some((entry) => String(entry || "").trim().length > 0);

      if (!hasIdentity) {
        errors.push(
          issue(
            "error",
            `records[${index}]`,
            "Product row requires a Product ID, WHODrug ID, brand, generic, INN, or API.",
          ),
        );
      }

      const productId = String(value.clientProductId || value.productId || "").trim();
      if (!productId) {
        errors.push(
          issue(
            "error",
            `records[${index}].clientProductId`,
            "A governed clientProductId or productId is required for auditable product matching.",
          ),
        );
      }

      const hasPharmaceuticalIdentity = [
        value.genericName,
        value.inn,
        value.api,
        value.composition,
        value.activeComposition,
      ].some((entry) => String(entry || "").trim().length > 0);
      if (!hasPharmaceuticalIdentity) {
        errors.push(
          issue(
            "error",
            `records[${index}].inn`,
            "A governed generic, INN, API, composition, or active composition is required; brand alone is insufficient.",
          ),
        );
      }

      if (!String(value.country || value.market || "").trim()) {
        errors.push(
          issue(
            "error",
            `records[${index}].country`,
            "Country/market is required for COI-specific licence assessment.",
          ),
        );
      }

      if (
        value.active === undefined &&
        value.authorizationActive === undefined &&
        value.licenceActive === undefined
      ) {
        errors.push(
          issue(
            "error",
            `records[${index}].active`,
            "An explicit licence/authorization active status is required.",
          ),
        );
      }

      if (!String(value.dosageForm || value.formulation || value.presentation || "").trim()) {
        warnings.push(
          issue(
            "warning",
            `records[${index}].dosageForm`,
            "No dosage form or formulation is configured; presentation-specific source products cannot be confirmed from this row.",
          ),
        );
      }
    });
  }

  if (resourceType === "LITERATURE_CALENDAR") {
    const records = recordsFromPayload(payload);
    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Literature Calendar must contain at least one schedule record.",
        ),
      );
    }

    records.forEach((value, index) => {
      if (!isRecord(value)) return;
      if (!String(value.frequency || "").trim()) {
        errors.push(
          issue(
            "error",
            `records[${index}].frequency`,
            "Calendar frequency is required.",
          ),
        );
      }
      if (!String(value.timezone || "").trim()) {
        warnings.push(
          issue(
            "warning",
            `records[${index}].timezone`,
            "Timezone is missing; tenant default will be used.",
          ),
        );
      }
    });
  }

  if (resourceType === "CLIENT_GUIDELINE") {
    if (!isRecord(payload) || !String(payload.content || "").trim()) {
      errors.push(
        issue(
          "error",
          "content",
          "Client Guideline requires extracted document content.",
        ),
      );
    }
  }

  if (resourceType === "OUTCOME_TEMPLATE") {
    if (!isRecord(payload)) {
      errors.push(
        issue("error", "payload", "Outcome Template must be a JSON object."),
      );
    } else {
      if (!String(payload.outputFormat || "").trim()) {
        errors.push(
          issue(
            "error",
            "outputFormat",
            "Outcome Template requires outputFormat.",
          ),
        );
      }
      if (!isRecord(payload.fieldMappings)) {
        errors.push(
          issue(
            "error",
            "fieldMappings",
            "Outcome Template requires fieldMappings.",
          ),
        );
      }
    }
  }

  if (resourceType === "LITERATURE_SOURCE") {
    const records = recordsFromPayload(payload);
    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Literature Source configuration requires at least one source.",
        ),
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validatedAt: new Date().toISOString(),
  };
}
