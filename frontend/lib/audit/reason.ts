const GENERIC_AUDIT_REASONS = new Set([
  "n/a",
  "na",
  "not applicable",
  "none",
  "test",
  "testing",
  "ok",
  "okay",
  "done",
]);

export function normalizeAuditReason(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateAuditReason(value: unknown): {
  valid: boolean;
  reason: string;
  message?: string;
} {
  const reason = normalizeAuditReason(value);

  if (reason.length < 15) {
    return {
      valid: false,
      reason,
      message: "Enter a specific audit reason of at least 15 characters.",
    };
  }

  if (GENERIC_AUDIT_REASONS.has(reason.toLowerCase())) {
    return {
      valid: false,
      reason,
      message: "Generic reasons such as 'Not applicable' are not acceptable for a GxP-controlled action.",
    };
  }

  return { valid: true, reason };
}
