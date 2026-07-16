export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRequiredFields(
  payload: Record<string, unknown>,
  requiredFields: string[],
): ValidationResult {
  const errors = requiredFields
    .filter((field) => {
      const value = payload[field];

      return value === undefined || value === null || value === "";
    })
    .map((field) => `${field} is required.`);

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateTenantRequest(payload: Record<string, unknown>): ValidationResult {
  return validateRequiredFields(payload, ["tenantId"]);
}

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => result.errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}