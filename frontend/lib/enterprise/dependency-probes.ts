import { getAiProviderConfiguration } from "./ai-provider-config";
import { getDatabaseReadiness } from "./database-readiness";
import { getRuntimeConfig } from "./environment";
import { healthRegistry } from "./health-registry";
import { probeHealthEndpoint, probeLocalDirectory } from "./resource-probes";
import type { HealthProbeOutput } from "./types";

let initialized = false;

export function registerDefaultDependencyProbes(): void {
  if (initialized) return;
  initialized = true;

  healthRegistry.register({
    name: "runtime",
    critical: true,
    probe: async () => ({
      status: "healthy",
      message: "Application runtime is responsive.",
      details: {
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    }),
  });

  healthRegistry.register({
    name: "ai-provider",
    critical: true,
    probe: probeAiProvider,
  });

  healthRegistry.register({
    name: "knowledge-service",
    critical: true,
    probe: probeKnowledgeService,
  });

  healthRegistry.register({
    name: "vector-service",
    critical: false,
    probe: probeVectorService,
  });

  healthRegistry.register({
    name: "evidence-store",
    critical: true,
    probe: probeEvidenceStore,
  });

  healthRegistry.register({
    name: "database",
    critical: true,
    probe: async () => {
      const report = await getDatabaseReadiness();
      return {
        status: report.status,
        message: report.message,
        details: {
          provider: report.provider,
          configured: report.configured,
          connectivityVerified: report.connectivityVerified,
          migrations: report.migrations,
        },
      };
    },
  });
}

async function probeAiProvider(): Promise<HealthProbeOutput> {
  const runtime = getRuntimeConfig();
  const provider = getAiProviderConfiguration();

  if (!provider.configured) {
    return {
      status: "unhealthy",
      message: provider.message,
      details: {
        provider: provider.provider,
        model: provider.model,
        supportedByRuntime: provider.supportedByRuntime,
        missingVariables: provider.missingVariables,
      },
    };
  }

  if (provider.healthUrl) {
    return probeHealthEndpoint({
      name: `AI provider ${provider.provider}`,
      healthUrl: provider.healthUrl,
      timeoutMs: runtime.dependencyTimeoutMs,
    });
  }

  return {
    status: "healthy",
    message: provider.message,
    details: {
      provider: provider.provider,
      model: provider.model,
      endpoint: provider.endpoint,
      connectivityVerifiedBy: "AI self-test",
    },
  };
}

async function probeKnowledgeService(): Promise<HealthProbeOutput> {
  const runtime = getRuntimeConfig();
  const healthUrl = process.env.KNOWLEDGE_HEALTH_URL?.trim();

  if (healthUrl) {
    return probeHealthEndpoint({
      name: "Knowledge service",
      healthUrl,
      timeoutMs: runtime.dependencyTimeoutMs,
    });
  }

  if (process.env.KNOWLEDGE_SERVICE_URL?.trim()) {
    return {
      status: "unhealthy",
      message:
        "KNOWLEDGE_SERVICE_URL is configured, but KNOWLEDGE_HEALTH_URL is required to verify connectivity.",
      details: { serviceUrl: process.env.KNOWLEDGE_SERVICE_URL.trim() },
    };
  }

  return probeLocalDirectory({
    name: "Knowledge service",
    root: process.env.KNOWLEDGE_ROOT,
    requireContent: true,
    requireWritable: false,
  });
}

async function probeVectorService(): Promise<HealthProbeOutput> {
  const runtime = getRuntimeConfig();
  const healthUrl = process.env.VECTOR_HEALTH_URL?.trim();

  if (healthUrl) {
    return probeHealthEndpoint({
      name: "Vector service",
      healthUrl,
      timeoutMs: runtime.dependencyTimeoutMs,
    });
  }

  const localRoot =
    process.env.CHROMA_PATH?.trim() ||
    process.env.VECTOR_STORE_ROOT?.trim() ||
    process.env.PGVECTOR_DATA_ROOT?.trim();

  if (localRoot) {
    return probeLocalDirectory({
      name: "Vector service",
      root: localRoot,
      requireContent: false,
      requireWritable: true,
    });
  }

  if (
    process.env.VECTOR_DATABASE_URL?.trim() ||
    process.env.CHROMA_URL?.trim() ||
    process.env.PGVECTOR_URL?.trim()
  ) {
    return {
      status: "degraded",
      message:
        "Vector service is configured, but VECTOR_HEALTH_URL is not available for connectivity verification.",
    };
  }

  return {
    status: "degraded",
    message: "Vector service is not configured; semantic retrieval is unavailable.",
  };
}

async function probeEvidenceStore(): Promise<HealthProbeOutput> {
  const runtime = getRuntimeConfig();
  const healthUrl = process.env.EVIDENCE_HEALTH_URL?.trim();

  if (healthUrl) {
    return probeHealthEndpoint({
      name: "Evidence store",
      healthUrl,
      timeoutMs: runtime.dependencyTimeoutMs,
    });
  }

  if (process.env.EVIDENCE_STORE_URL?.trim()) {
    return {
      status: "unhealthy",
      message:
        "EVIDENCE_STORE_URL is configured, but EVIDENCE_HEALTH_URL is required to verify connectivity.",
      details: { serviceUrl: process.env.EVIDENCE_STORE_URL.trim() },
    };
  }

  if (
    process.env.EVIDENCE_STORE_BACKEND?.trim().toLowerCase() === "database"
  ) {
    const database = await getDatabaseReadiness();
    return {
      status: database.status,
      message:
        database.status === "healthy"
          ? "Evidence store uses the verified production database."
          : `Evidence store database backend is not ready: ${database.message}`,
      details: { provider: database.provider },
    };
  }

  return probeLocalDirectory({
    name: "Evidence store",
    root: process.env.EVIDENCE_STORE_ROOT,
    requireContent: false,
    requireWritable: true,
  });
}
