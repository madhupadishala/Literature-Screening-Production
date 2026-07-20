const SENSITIVE_KEY =
  /(authorization|cookie|secret|token|password|api[-_]?key|private[-_]?key|session|email|phone|mobile|address|patient|reporter|dob|date[-_]?of[-_]?birth)/i;

const BEARER_TOKEN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_TOKEN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(JWT_TOKEN, "[REDACTED_JWT]")
    .replace(EMAIL, "[REDACTED_EMAIL]");
}

export function redactForLogs(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[FUNCTION]";
  if (typeof value !== "object") return String(value);

  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactForLogs(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED]"
      : redactForLogs(item, depth + 1, seen);
  }

  return output;
}
