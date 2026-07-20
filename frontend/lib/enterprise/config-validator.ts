import { getAiProviderConfiguration } from "./ai-provider-config";
import { getRuntimeConfig } from "./environment";

export interface ConfigValidationItem {
  name: string;
  passed: boolean;
  critical: boolean;
  message: string;
  details?: unknown;
}

export interface ConfigValidationReport {
  valid: boolean;
  environment: string;
  checkedAt: string;
  items: ConfigValidationItem[];
}

export function validateRuntimeConfiguration(): ConfigValidationReport {
  const config = getRuntimeConfig();
  const production = config.environment === "production";
  const ai = getAiProviderConfiguration();
  const knowledgeConfigured = Boolean(
    process.env.KNOWLEDGE_ROOT?.trim() ||
      (process.env.KNOWLEDGE_SERVICE_URL?.trim() &&
        process.env.KNOWLEDGE_HEALTH_URL?.trim()),
  );
  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const evidenceConfigured = Boolean(
    process.env.EVIDENCE_STORE_ROOT?.trim() ||
      (process.env.EVIDENCE_STORE_URL?.trim() &&
        process.env.EVIDENCE_HEALTH_URL?.trim()) ||
      (process.env.EVIDENCE_STORE_BACKEND?.trim().toLowerCase() === "database" &&
        databaseConfigured),
  );

  const items: ConfigValidationItem[] = [
    {
      name: "monitoring-token",
      passed: !production || Boolean(config.internalMonitoringToken),
      critical: production,
      message:
        !production || config.internalMonitoringToken
          ? "Monitoring access control is configured for this environment."
          : "INTERNAL_MONITORING_TOKEN is required in production.",
    },
    {
      name: "monitoring-token-strength",
      passed:
        !config.internalMonitoringToken || config.internalMonitoringToken.length >= 32,
      critical: production,
      message:
        !config.internalMonitoringToken || config.internalMonitoringToken.length >= 32
          ? "Monitoring token length is acceptable."
          : "INTERNAL_MONITORING_TOKEN must contain at least 32 characters.",
    },
    {
      name: "ai-provider",
      passed: ai.configured,
      critical: production,
      message: ai.message,
      details: {
        provider: ai.provider,
        model: ai.model,
        supportedByRuntime: ai.supportedByRuntime,
        missingVariables: ai.missingVariables,
      },
    },
    {
      name: "knowledge-service",
      passed: knowledgeConfigured,
      critical: production,
      message: knowledgeConfigured
        ? "Knowledge service configuration is present."
        : "Configure a populated KNOWLEDGE_ROOT or a verifiable KNOWLEDGE_SERVICE_URL and KNOWLEDGE_HEALTH_URL.",
    },
    {
      name: "evidence-store",
      passed: evidenceConfigured,
      critical: production,
      message: evidenceConfigured
        ? "Evidence-store configuration is present."
        : "Configure EVIDENCE_STORE_ROOT, a verifiable evidence service, or the database evidence backend.",
    },
    {
      name: "production-database",
      passed: !production || databaseConfigured,
      critical: production,
      message: databaseConfigured
        ? "PostgreSQL DATABASE_URL is configured. Connectivity and migrations are verified by the critical database dependency probe."
        : "DATABASE_URL is required in production; memory-development is not release-ready.",
    },
    {
      name: "database-verification-contract",
      passed: true,
      critical: false,
      message:
        "Database connectivity and migration status are read directly from PostgreSQL; DATABASE_HEALTH_URL and DB_MIGRATIONS_APPLIED are no longer trusted as release evidence.",
    },
    {
      name: "request-size-limit",
      passed: config.maxRequestBodyBytes <= 10_485_760,
      critical: true,
      message: `Maximum request body is ${config.maxRequestBodyBytes} bytes.`,
    },
    {
      name: "rate-limit",
      passed: config.apiRateLimit > 0 && config.apiRateLimitWindowMs >= 1_000,
      critical: true,
      message: `${config.apiRateLimit} requests per ${config.apiRateLimitWindowMs} ms.`,
    },
    {
      name: "build-identity",
      passed: !production || config.buildSha !== "development",
      critical: production,
      message:
        config.buildSha !== "development"
          ? "Build identity is available."
          : "BUILD_SHA or VERCEL_GIT_COMMIT_SHA is not set.",
    },
  ];

  return {
    valid: items.every((item) => item.passed || !item.critical),
    environment: config.environment,
    checkedAt: new Date().toISOString(),
    items,
  };
}
