export const LEGACY_VECTOR_DISABLED_MESSAGE =
  "Legacy in-memory vector and mock embedding operations are disabled. Use the controlled pgvector knowledge APIs.";

export function assertLegacyVectorRuntimeAllowed(
  environment = process.env.NODE_ENV || "development",
): void {
  const development = environment === "development";
  const explicitlyEnabled =
    process.env.ALLOW_LEGACY_IN_MEMORY_VECTOR?.trim().toLowerCase() === "true";
  if (!development || !explicitlyEnabled) {
    throw new Error(LEGACY_VECTOR_DISABLED_MESSAGE);
  }
}
