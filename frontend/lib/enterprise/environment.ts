export interface RuntimeConfig {
  appName: string;
  appVersion: string;
  environment: "development" | "test" | "production";
  region: string;
  buildSha: string;
  logLevel: "debug" | "info" | "warn" | "error";
  internalMonitoringToken?: string;
  maxRequestBodyBytes: number;
  apiRateLimit: number;
  apiRateLimitWindowMs: number;
  dependencyTimeoutMs: number;
  healthProbeTimeoutMs: number;
  securityEventRetention: number;
}

let cachedConfig: RuntimeConfig | undefined;

function integerFromEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeEnvironment(
  value: string | undefined,
): RuntimeConfig["environment"] {
  if (value === "production" || value === "test") return value;
  return "development";
}

function normalizeLogLevel(value: string | undefined): RuntimeConfig["logLevel"] {
  if (value === "debug" || value === "warn" || value === "error") return value;
  return "info";
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = Object.freeze({
    appName: process.env.APP_NAME?.trim() || "ClinixAI Literature Screening",
    appVersion: process.env.APP_VERSION?.trim() || "5.0.0",
    environment: normalizeEnvironment(process.env.NODE_ENV),
    region: process.env.APP_REGION?.trim() || process.env.VERCEL_REGION?.trim() || "local",
    buildSha:
      process.env.BUILD_SHA?.trim() ||
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      "development",
    logLevel: normalizeLogLevel(process.env.LOG_LEVEL),
    internalMonitoringToken: process.env.INTERNAL_MONITORING_TOKEN?.trim() || undefined,
    maxRequestBodyBytes: integerFromEnv(
      "MAX_REQUEST_BODY_BYTES",
      1_048_576,
      16_384,
      10_485_760,
    ),
    apiRateLimit: integerFromEnv("API_RATE_LIMIT", 300, 10, 100_000),
    apiRateLimitWindowMs: integerFromEnv(
      "API_RATE_LIMIT_WINDOW_MS",
      60_000,
      1_000,
      3_600_000,
    ),
    dependencyTimeoutMs: integerFromEnv(
      "DEPENDENCY_TIMEOUT_MS",
      5_000,
      250,
      60_000,
    ),
    healthProbeTimeoutMs: integerFromEnv(
      "HEALTH_PROBE_TIMEOUT_MS",
      3_000,
      250,
      30_000,
    ),
    securityEventRetention: integerFromEnv(
      "SECURITY_EVENT_RETENTION",
      500,
      100,
      10_000,
    ),
  });

  return cachedConfig;
}

export function resetRuntimeConfigForTests(): void {
  cachedConfig = undefined;
}
