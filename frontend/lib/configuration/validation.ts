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

      const activeValue =
        value.active ?? value.authorizationActive ?? value.licenceActive;
      const normalizedActive = String(activeValue ?? "").trim().toLowerCase();
      if (
        activeValue !== undefined &&
        !["true", "false", "yes", "no", "1", "0", "active", "inactive", "withdrawn", "expired"].includes(normalizedActive)
      ) {
        errors.push(
          issue(
            "error",
            `records[${index}].active`,
            "Licence active status must be a controlled boolean/active-state value.",
          ),
        );
      }

      if (!String(value.mah || value.marketingAuthorizationHolder || value.marketing_authorization_holder || "").trim()) {
        errors.push(
          issue(
            "error",
            `records[${index}].mah`,
            "Marketing Authorisation Holder is required for company/MAH applicability assessment.",
          ),
        );
      }

      if (!String(value.lifecycleStatus || value.investigationalOrMarketed || value.productLifecycle || "").trim()) {
        errors.push(
          issue(
            "error",
            `records[${index}].lifecycleStatus`,
            "Product lifecycle classification is required to distinguish marketed and investigational pathways.",
          ),
        );
      }

      if (!String(value.mahEffectiveFrom || value.licenceEffectiveFrom || value.effectiveFrom || "").trim()) {
        warnings.push(
          issue(
            "warning",
            `records[${index}].mahEffectiveFrom`,
            "No MAH/licence effective-from date is configured; historical applicability may require manual review.",
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

  if (resourceType === "SEARCH_PROFILE") {
    const records = recordsFromPayload(payload);
    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Search Profile configuration must contain at least one governed profile.",
        ),
      );
    }

    const profileKeys = new Set<string>();

    records.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(issue("error", `records[${index}]`, "Search Profile row must be an object."));
        return;
      }

      const profileKey = String(value.profileKey || value.searchProfileKey || "").trim();
      const productId = String(value.productId || value.clientProductId || "").trim();
      const sourceKeys = Array.isArray(value.sourceKeys)
        ? value.sourceKeys.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const limit = Number(value.limit || value.maxResults || 100);
      const lookbackDays = Number(value.lookbackDays || 7);
      const status = String(value.status || "ACTIVE").trim().toUpperCase();

      if (!profileKey) {
        errors.push(issue("error", `records[${index}].profileKey`, "A unique profileKey is required."));
      } else if (profileKeys.has(profileKey)) {
        errors.push(
          issue(
            "error",
            `records[${index}].profileKey`,
            "profileKey values must be unique within the Search Profile configuration.",
          ),
        );
      } else {
        profileKeys.add(profileKey);
      }
      if (!productId) {
        errors.push(
          issue(
            "error",
            `records[${index}].productId`,
            "A governed productId/clientProductId is required for scheduled production surveillance.",
          ),
        );
      }
      if (sourceKeys.length === 0) {
        errors.push(
          issue(
            "error",
            `records[${index}].sourceKeys`,
            "Search Profile requires at least one approved literature source.",
          ),
        );
      }
      const invalidSources = sourceKeys.filter(
        (sourceKey) => !["PUBMED", "EUROPE_PMC", "CROSSREF"].includes(sourceKey),
      );
      if (invalidSources.length > 0) {
        errors.push(
          issue(
            "error",
            `records[${index}].sourceKeys`,
            `Unsupported literature source(s): ${invalidSources.join(", ")}.`,
          ),
        );
      }
      if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
        errors.push(
          issue(
            "error",
            `records[${index}].limit`,
            "Search Profile result limit must be between 1 and 500.",
          ),
        );
      }
      if (!Number.isFinite(lookbackDays) || lookbackDays < 1 || lookbackDays > 90) {
        errors.push(
          issue(
            "error",
            `records[${index}].lookbackDays`,
            "Search Profile lookbackDays must be between 1 and 90.",
          ),
        );
      }
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        errors.push(
          issue(
            "error",
            `records[${index}].status`,
            "Search Profile status must be ACTIVE or INACTIVE.",
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

    const calendarIds = new Set<string>();

    records.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(issue("error", `records[${index}]`, "Calendar row must be an object."));
        return;
      }
      const calendarId = String(value.calendarId || value.scheduleKey || "").trim();
      const searchProfileKey = String(value.searchProfileKey || value.profileKey || "").trim();
      const frequency = String(value.frequency || "").trim().toUpperCase();
      const executionTime = String(value.executionTime || "").trim();
      const timezone = String(value.timezone || "").trim();

      if (!calendarId) {
        errors.push(
          issue("error", `records[${index}].calendarId`, "A unique calendarId is required."),
        );
      } else if (calendarIds.has(calendarId)) {
        errors.push(
          issue(
            "error",
            `records[${index}].calendarId`,
            "calendarId values must be unique within the Literature Calendar.",
          ),
        );
      } else {
        calendarIds.add(calendarId);
      }
      if (!searchProfileKey) {
        errors.push(
          issue(
            "error",
            `records[${index}].searchProfileKey`,
            "Calendar record must reference an approved Search Profile.",
          ),
        );
      }
      if (!["DAILY", "WEEKLY", "MONTHLY"].includes(frequency)) {
        errors.push(
          issue(
            "error",
            `records[${index}].frequency`,
            "Calendar frequency must be DAILY, WEEKLY, or MONTHLY.",
          ),
        );
      }
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(executionTime)) {
        errors.push(
          issue(
            "error",
            `records[${index}].executionTime`,
            "Calendar executionTime must use 24-hour HH:MM format.",
          ),
        );
      }
      if (!timezone) {
        errors.push(
          issue(
            "error",
            `records[${index}].timezone`,
            "Timezone is required for reproducible scheduled search execution.",
          ),
        );
      } else {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
        } catch {
          errors.push(
            issue(
              "error",
              `records[${index}].timezone`,
              "Timezone must be a valid IANA timezone identifier.",
            ),
          );
        }
      }

      const calendarStatus = String(value.status || "ACTIVE").trim().toUpperCase();
      if (!["ACTIVE", "INACTIVE"].includes(calendarStatus)) {
        errors.push(
          issue(
            "error",
            `records[${index}].status`,
            "Calendar status must be ACTIVE or INACTIVE.",
          ),
        );
      }

      const graceMinutes = Number(value.graceMinutes || 90);
      const catchUpHours = Number(value.catchUpHours || 72);
      if (!Number.isFinite(graceMinutes) || graceMinutes < 5 || graceMinutes > 1440) {
        errors.push(
          issue(
            "error",
            `records[${index}].graceMinutes`,
            "graceMinutes must be between 5 and 1440.",
          ),
        );
      }
      if (!Number.isFinite(catchUpHours) || catchUpHours < 1 || catchUpHours > 168) {
        errors.push(
          issue(
            "error",
            `records[${index}].catchUpHours`,
            "catchUpHours must be between 1 and 168.",
          ),
        );
      }

      const executionDay = String(value.executionDay || "").trim().toUpperCase();
      if (
        frequency === "WEEKLY" &&
        !["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"].includes(
          executionDay,
        )
      ) {
        errors.push(
          issue(
            "error",
            `records[${index}].executionDay`,
            "Weekly calendars require a valid executionDay.",
          ),
        );
      }
      if (frequency === "MONTHLY") {
        const dayOfMonth = Number(value.dayOfMonth || 0);
        if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
          errors.push(
            issue(
              "error",
              `records[${index}].dayOfMonth`,
              "Monthly calendars require dayOfMonth between 1 and 31.",
            ),
          );
        }
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


  if (resourceType === "LABEL_REFERENCE") {
    const records = recordsFromPayload(payload);
    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Label / RSI configuration must contain at least one governed reference record.",
        ),
      );
    }

    records.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(issue("error", `records[${index}]`, "Label reference row must be an object."));
        return;
      }

      const labelKey = String(value.labelKey || value.referenceLabelKey || "").trim();
      const productId = String(value.clientProductId || value.productId || "").trim();
      const country = String(value.country || value.market || "").trim();
      const labelType = String(value.labelType || value.referenceType || "").trim();
      const version = String(value.version || value.labelVersion || "").trim();
      const effectiveFrom = String(value.effectiveFrom || value.labelEffectiveFrom || "").trim();
      const eventTerms = Array.isArray(value.eventTerms)
        ? value.eventTerms.map((term) => String(term || "").trim()).filter(Boolean)
        : [];
      const usageScope = String(
        value.usageScope ||
          (isRecord(payload) ? payload.usageScope : "") ||
          "PRODUCTION",
      ).trim().toUpperCase();

      if (!["PRODUCTION", "VALIDATION_ONLY"].includes(usageScope)) {
        errors.push(
          issue(
            "error",
            `records[${index}].usageScope`,
            "usageScope must be PRODUCTION or VALIDATION_ONLY.",
          ),
        );
      }
      if (!labelKey) {
        errors.push(issue("error", `records[${index}].labelKey`, "A unique labelKey is required."));
      }
      if (!productId) {
        errors.push(
          issue(
            "error",
            `records[${index}].clientProductId`,
            "Label / RSI must be linked to a governed clientProductId or productId.",
          ),
        );
      }
      if (!country) {
        errors.push(issue("error", `records[${index}].country`, "Country/market is required."));
      }
      if (!labelType) {
        errors.push(
          issue(
            "error",
            `records[${index}].labelType`,
            "Label type is required, for example CCSI, CCDS, SmPC, USPI, or RSI.",
          ),
        );
      }
      if (!version) {
        errors.push(issue("error", `records[${index}].version`, "Label version is required."));
      }
      if (!effectiveFrom) {
        errors.push(
          issue(
            "error",
            `records[${index}].effectiveFrom`,
            "Label effective-from date is required for date-specific expectedness.",
          ),
        );
      }
      if (eventTerms.length === 0) {
        warnings.push(
          issue(
            "warning",
            `records[${index}].eventTerms`,
            "No expected event terms are configured; automated expectedness will remain UNRESOLVED.",
          ),
        );
      }
    });
  }

  if (resourceType === "CAUSALITY_METHOD") {
    const records = recordsFromPayload(payload);
    if (records.length === 0) {
      errors.push(
        issue(
          "error",
          "records",
          "Causality Method configuration must contain at least one approved method.",
        ),
      );
    }

    records.forEach((value, index) => {
      if (!isRecord(value)) {
        errors.push(issue("error", `records[${index}]`, "Causality method row must be an object."));
        return;
      }

      const methodKey = String(value.methodKey || "").trim();
      const methodName = String(value.methodName || value.name || "").trim();
      const version = String(value.version || value.methodVersion || "").trim();
      const conclusions = Array.isArray(value.allowedConclusions)
        ? value.allowedConclusions.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
      const usageScope = String(
        value.usageScope ||
          (isRecord(payload) ? payload.usageScope : "") ||
          "PRODUCTION",
      ).trim().toUpperCase();

      if (!["PRODUCTION", "VALIDATION_ONLY"].includes(usageScope)) {
        errors.push(
          issue(
            "error",
            `records[${index}].usageScope`,
            "usageScope must be PRODUCTION or VALIDATION_ONLY.",
          ),
        );
      }
      if (!methodKey) {
        errors.push(issue("error", `records[${index}].methodKey`, "A causality methodKey is required."));
      }
      if (!methodName) {
        errors.push(issue("error", `records[${index}].methodName`, "A causality method name is required."));
      }
      if (!version) {
        errors.push(issue("error", `records[${index}].version`, "Causality method version is required."));
      }
      if (conclusions.length === 0) {
        errors.push(
          issue(
            "error",
            `records[${index}].allowedConclusions`,
            "At least one controlled causality conclusion is required.",
          ),
        );
      }
      if (!String(value.methodology || value.description || "").trim()) {
        warnings.push(
          issue(
            "warning",
            `records[${index}].methodology`,
            "No method description is configured; reviewer guidance will be limited.",
          ),
        );
      }
    });
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
