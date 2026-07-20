import { randomUUID } from "node:crypto";

const SAFE_IDENTIFIER = /[^a-zA-Z0-9._:-]/g;

export function createId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function sanitizeIdentifier(
  value: string | null | undefined,
  maximumLength = 128,
): string | undefined {
  if (!value) return undefined;

  const sanitized = value
    .trim()
    .replace(SAFE_IDENTIFIER, "_")
    .slice(0, maximumLength);

  return sanitized || undefined;
}
