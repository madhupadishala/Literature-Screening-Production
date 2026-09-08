import { getAiProviderConfiguration } from "../enterprise/ai-provider-config";
import { getRuntimeConfig } from "../enterprise/environment";
import { getReleaseConfig } from "./release-config";
import type { EnvironmentContractItem, EnvironmentContractReport } from "./types";

export function validateReleaseEnvironment(): EnvironmentContractReport {
  const runtime = getRuntimeConfig();
  const release = getReleaseConfig();
  const production = runtime.environment === "production";
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
  const ai = getAiProviderConfiguration();
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const databaseSslMode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase() || "disable";
  const demoPrincipalDisabled = process.env.ALLOW_DEMO_PRINCIPAL?.trim().toLowerCase() !== "true";
  const knowledgeConfigured = Boolean(
    process.env.KNOWLEDGE_ROOT?.trim() ||
    (process.env.KNOWLEDGE_SERVICE_URL?.trim() && process.env.KNOWLEDGE_HEALTH_URL?.trim()),
  );
  const evidenceConfigured = Boolean(
    process.env.EVIDENCE_STORE_ROOT?.trim() ||
    (process.env.EVIDENCE_STORE_URL?.trim() && process.env.EVIDENCE_HEALTH_URL?.trim()) ||
    (process.env.EVIDENCE_STORE_BACKEND?.trim().toLowerCase() === "database" && databaseConfigured),
  );
  const sessionSecret = process.env.SESSION_SECRET?.trim() || "";
  const edgeRateLimitProvider = process.env.EDGE_RATE_LIMIT_PROVIDER?.trim() || "";
  const securityEventSink = process.env.SECURITY_EVENT_SINK?.trim() || "";
  const backupVerifiedAt = recentVerification(process.env.DATABASE_BACKUP_VERIFIED_AT);
  const restoreVerifiedAt = recentVerification(process.env.DATABASE_RESTORE_VERIFIED_AT);
  const rollbackBuildSha = process.env.ROLLBACK_BUILD_SHA?.trim() || "";

  const items: EnvironmentContractItem[] = [
    item(
      "node-runtime",
      nodeMajor >= 20,
      true,
      `Node.js ${process.versions.node} is running; Node.js 20 or later is required.`,
    ),
    item(
      "release-version",
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(release.releaseVersion),
      true,
      `Release version is ${release.releaseVersion}. Use semantic versioning.`,
    ),
    item(
      "build-identity",
      !production || runtime.buildSha !== "development",
      production,
      runtime.buildSha === "development"
        ? "BUILD_SHA or VERCEL_GIT_COMMIT_SHA is not configured."
        : `Build identity is ${runtime.buildSha}.`,
    ),
    item("ai-provider", ai.configured, production, ai.message),
    item(
      "knowledge-service",
      knowledgeConfigured,
      production,
      knowledgeConfigured
        ? "Knowledge service configuration is present."
        : "Configure a populated KNOWLEDGE_ROOT or a verifiable knowledge service.",
    ),
    item(
      "evidence-store",
      evidenceConfigured,
      production,
      evidenceConfigured
        ? "Evidence-store configuration is present."
        : "Configure EVIDENCE_STORE_ROOT, a verifiable evidence service, or the database evidence backend.",
    ),
    item(
      "production-database",
      !production || databaseConfigured,
      production,
      databaseConfigured
        ? "PostgreSQL DATABASE_URL is configured; live connectivity and migrations are enforced by the dependency-health gate."
        : "DATABASE_URL is required in production.",
    ),
    item(
      "database-transport-security",
      !production || databaseSslMode !== "disable",
      production,
      databaseSslMode === "disable"
        ? "DATABASE_SSL_MODE disables transport security."
        : `Database transport uses ${databaseSslMode} mode.`,
    ),
    item(
      "demo-principal-disabled",
      !production || demoPrincipalDisabled,
      production,
      demoPrincipalDisabled
        ? "Demo principal fallback is disabled."
        : "ALLOW_DEMO_PRINCIPAL must be false in production.",
    ),
    item(
      "session-secret-strength",
      !production || sessionSecret.length >= 32,
      production,
      sessionSecret.length >= 32
        ? "Server session signing secret length is acceptable."
        : "SESSION_SECRET must contain at least 32 characters.",
    ),
    item(
      "distributed-rate-limit",
      !production || Boolean(edgeRateLimitProvider),
      production,
      edgeRateLimitProvider
        ? `Distributed API rate limiting is delegated to ${edgeRateLimitProvider}.`
        : "EDGE_RATE_LIMIT_PROVIDER is required; process-local limiting is insufficient for production.",
    ),
    item(
      "durable-security-event-sink",
      !production || Boolean(securityEventSink),
      production,
      securityEventSink
        ? `Proxy security events are exported through ${securityEventSink}.`
        : "SECURITY_EVENT_SINK is required; process-local security events are not durable.",
    ),
    item(
      "recent-database-backup",
      !production || backupVerifiedAt.passed,
      production,
      backupVerifiedAt.message,
    ),
    item(
      "recent-restore-test",
      !production || restoreVerifiedAt.passed,
      production,
      restoreVerifiedAt.message,
    ),
    item(
      "rollback-build-available",
      !production || Boolean(rollbackBuildSha),
      production,
      rollbackBuildSha
        ? `Rollback build ${rollbackBuildSha} is identified.`
        : "ROLLBACK_BUILD_SHA is required before production release.",
    ),
    item(
      "database-evidence-source",
      true,
      false,
      "Database release evidence is queried directly from PostgreSQL instead of DATABASE_HEALTH_URL or DB_MIGRATIONS_APPLIED declarations.",
    ),
    item(
      "monitoring-token",
      !production || Boolean(runtime.internalMonitoringToken),
      production,
      runtime.internalMonitoringToken
        ? "Internal monitoring and release routes are access controlled."
        : "INTERNAL_MONITORING_TOKEN is required in production.",
    ),
    item(
      "monitoring-token-strength",
      !runtime.internalMonitoringToken || runtime.internalMonitoringToken.length >= 32,
      production,
      !runtime.internalMonitoringToken || runtime.internalMonitoringToken.length >= 32
        ? "Internal token length is acceptable."
        : "INTERNAL_MONITORING_TOKEN must contain at least 32 characters.",
    ),
    item(
      "production-mode",
      !production || process.env.NODE_ENV === "production",
      production,
      `NODE_ENV is ${process.env.NODE_ENV || "unset"}.`,
    ),
    item(
      "release-base-url",
      !production || isSecureReleaseUrl(release.baseUrl),
      production,
      release.baseUrl
        ? `Release probes use ${release.baseUrl}.`
        : "RELEASE_BASE_URL is unset; API-triggered probes will use the request origin.",
    ),
  ];

  return {
    passed: items.every((entry) => entry.passed || !entry.critical),
    checkedAt: new Date().toISOString(),
    items,
  };
}

function recentVerification(value: string | undefined): { passed: boolean; message: string } {
  const timestamp = value?.trim();
  if (!timestamp) return { passed: false, message: "Verification timestamp is not configured." };
  const parsed = Date.parse(timestamp);
  const maximumAgeMs = 30 * 24 * 60 * 60 * 1_000;
  const passed = Number.isFinite(parsed) && parsed <= Date.now() && Date.now() - parsed <= maximumAgeMs;
  return { passed, message: passed
    ? `Verification was completed at ${new Date(parsed).toISOString()}.`
    : "Verification must be a valid timestamp from the last 30 days." };
}

function isSecureReleaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

function item(
  name: string,
  passed: boolean,
  critical: boolean,
  message: string,
): EnvironmentContractItem {
  return { name, passed, critical, message };
}
