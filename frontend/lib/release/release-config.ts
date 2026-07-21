import { getRuntimeConfig } from "../enterprise/environment";

export interface ReleaseConfig {
  releaseName: string;
  releaseVersion: string;
  baseUrl?: string;
  operator: string;
  requestTimeoutMs: number;
}

let cached: ReleaseConfig | undefined;

export function getReleaseConfig(): ReleaseConfig {
  if (cached) return cached;

  const runtime = getRuntimeConfig();
  const timeout = Number.parseInt(process.env.RELEASE_REQUEST_TIMEOUT_MS || "15000", 10);

  cached = Object.freeze({
    releaseName: process.env.RELEASE_NAME?.trim() || `ClinixAI Literature RC ${runtime.appVersion}`,
    releaseVersion: process.env.RELEASE_VERSION?.trim() || runtime.appVersion,
    baseUrl: normalizeBaseUrl(process.env.RELEASE_BASE_URL),
    operator: process.env.RELEASE_OPERATOR?.trim() || "release-operator",
    requestTimeoutMs: Number.isFinite(timeout)
      ? Math.min(60_000, Math.max(1_000, timeout))
      : 15_000,
  });

  return cached;
}

export function resetReleaseConfigForTests(): void {
  cached = undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.origin;
  } catch {
    return undefined;
  }
}
