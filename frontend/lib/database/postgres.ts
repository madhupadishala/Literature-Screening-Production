import { Pool, type PoolConfig } from "pg";
import { getRuntimeConfig } from "@/lib/enterprise/environment";

interface GlobalPostgresState {
  pool?: Pool;
  databaseUrl?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __clinixaiPostgresState: GlobalPostgresState | undefined;
}

function getGlobalState(): GlobalPostgresState {
  if (!globalThis.__clinixaiPostgresState) {
    globalThis.__clinixaiPostgresState = {};
  }
  return globalThis.__clinixaiPostgresState;
}

function buildSslConfiguration(): PoolConfig["ssl"] {
  const mode = process.env.DATABASE_SSL_MODE?.trim().toLowerCase();

  if (!mode || mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  if (mode === "require" || mode === "verify-full") {
    return { rejectUnauthorized: mode === "verify-full" };
  }

  throw new Error(
    "DATABASE_SSL_MODE must be disable, no-verify, require, or verify-full.",
  );
}

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return databaseUrl;
}

export function getPostgresPool(): Pool {
  const runtime = getRuntimeConfig();
  const databaseUrl = getDatabaseUrl();
  const state = getGlobalState();

  if (state.pool && state.databaseUrl === databaseUrl) {
    return state.pool;
  }

  if (state.pool) {
    void state.pool.end().catch(() => undefined);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: buildSslConfiguration(),
    max: integerFromEnvironment("DATABASE_POOL_MAX", 10, 1, 100),
    min: integerFromEnvironment("DATABASE_POOL_MIN", 0, 0, 20),
    idleTimeoutMillis: integerFromEnvironment(
      "DATABASE_IDLE_TIMEOUT_MS",
      30_000,
      1_000,
      300_000,
    ),
    connectionTimeoutMillis: runtime.dependencyTimeoutMs,
    statement_timeout: integerFromEnvironment(
      "DATABASE_STATEMENT_TIMEOUT_MS",
      15_000,
      1_000,
      120_000,
    ),
    query_timeout: integerFromEnvironment(
      "DATABASE_QUERY_TIMEOUT_MS",
      20_000,
      1_000,
      180_000,
    ),
    application_name: runtime.appName,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error.", {
      name: error.name,
      message: error.message,
    });
  });

  state.pool = pool;
  state.databaseUrl = databaseUrl;
  return pool;
}

export async function closePostgresPool(): Promise<void> {
  const state = getGlobalState();
  if (!state.pool) return;

  const pool = state.pool;
  state.pool = undefined;
  state.databaseUrl = undefined;
  await pool.end();
}

export interface SafeDatabaseTarget {
  provider: "postgresql";
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: string;
}

export function getSafeDatabaseTarget(): SafeDatabaseTarget {
  const parsed = new URL(getDatabaseUrl());

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Sprint 6 production database must use PostgreSQL.");
  }

  return {
    provider: "postgresql",
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || "5432", 10),
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    username: decodeURIComponent(parsed.username || "unknown"),
    sslMode: process.env.DATABASE_SSL_MODE?.trim() || "disable",
  };
}

function integerFromEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
