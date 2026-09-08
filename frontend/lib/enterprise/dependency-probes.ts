import { getAiProviderConfiguration } from "./ai-provider-config";
import { getDatabaseReadiness } from "./database-readiness";
import { getRuntimeConfig } from "./environment";
import { getPostgresPool } from "@/lib/database/postgres";
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
    critical: true,
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
  if (!process.env.DATABASE_URL?.trim()) {
    return { status: "unhealthy", message: "Controlled pgvector requires DATABASE_URL." };
  }
  try {
    const result = await getPostgresPool().query<{
      vector_installed: boolean; repository_table: boolean; chunk_table: boolean;
    }>(`SELECT
      EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_installed,
      to_regclass('public.controlled_knowledge_repositories') IS NOT NULL AS repository_table,
      to_regclass('public.knowledge_chunks') IS NOT NULL AS chunk_table`);
    const row = result.rows[0];
    const ready = row?.vector_installed && row.repository_table && row.chunk_table;
    return { status: ready ? "healthy" : "unhealthy",
      message: ready
        ? "Controlled PostgreSQL/pgvector schema is available."
        : "Controlled pgvector extension or required schema is unavailable.",
      details: row };
  } catch (error) {
    return { status: "unhealthy", message: "Controlled pgvector health query failed.",
      details: { error: error instanceof Error ? error.message : String(error) } };
  }
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
