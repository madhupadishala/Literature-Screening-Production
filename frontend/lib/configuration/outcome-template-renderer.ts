import "server-only";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function valueAtPath(source: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (!isRecord(current)) return undefined;
      return current[segment];
    }, source);
}

export interface OutcomeTemplateRenderResult {
  outputFormat: string;
  payload: Record<string, unknown>;
  validationErrors: string[];
}

export function renderOutcomeTemplate(input: {
  standardPayload: Record<string, unknown>;
  templatePayload: unknown;
}): OutcomeTemplateRenderResult {
  if (!isRecord(input.templatePayload)) {
    throw new Error("Active Outcome Template is not a JSON object.");
  }

  const mappings = isRecord(input.templatePayload.fieldMappings)
    ? input.templatePayload.fieldMappings
    : {};
  const validation = isRecord(input.templatePayload.validation)
    ? input.templatePayload.validation
    : {};

  const payload = Object.fromEntries(
    Object.entries(mappings).map(([targetField, sourcePath]) => [
      targetField,
      valueAtPath(input.standardPayload, String(sourcePath)),
    ]),
  );

  const validationErrors = Object.entries(validation).flatMap(
    ([targetField, rule]) => {
      if (String(rule).toLowerCase() !== "required") return [];
      const value = payload[targetField];
      const missing =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      return missing ? [`${targetField} is required by the active Outcome Template.`] : [];
    },
  );

  return {
    outputFormat: String(input.templatePayload.outputFormat || "JSON"),
    payload,
    validationErrors,
  };
}
