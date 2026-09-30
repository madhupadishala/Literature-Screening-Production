import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getPostgresPool } from "@/lib/database/postgres";
import type { AuthProvider } from "./auth-types";

export const NEXUS_IDENTITY_SESSION_COOKIE = "nexus_identity_session";
export const NEXUS_IDENTITY_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface NexusIdentitySession {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  provider: AuthProvider;
  issuedAt: string;
  expiresAt: string;
}

interface IdentitySessionRow {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  provider: AuthProvider;
  issued_at: Date | string;
  expires_at: Date | string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function createIdentitySession(input: {
  userId: string;
  provider?: AuthProvider;
}): Promise<{ token: string; session: NexusIdentitySession }> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const provider = input.provider ?? "internal";
  const expiresAt = new Date(Date.now() + NEXUS_IDENTITY_SESSION_MAX_AGE_SECONDS * 1000);

  const result = await getPostgresPool().query<IdentitySessionRow>(
    `INSERT INTO nexus_identity_sessions (
       user_id, token_hash, provider, status, expires_at
     ) VALUES ($1,$2,$3,'active',$4)
     RETURNING
       id AS session_id,
       user_id,
       (SELECT email FROM application_users WHERE id = user_id) AS email,
       (SELECT display_name FROM application_users WHERE id = user_id) AS display_name,
       provider,
       issued_at,
       expires_at`,
    [input.userId, tokenHash, provider, expiresAt],
  );

  const row = result.rows[0];
  return {
    token,
    session: {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      provider: row.provider,
      issuedAt: iso(row.issued_at),
      expiresAt: iso(row.expires_at),
    },
  };
}

export async function resolveIdentitySession(
  token: string | null | undefined,
): Promise<NexusIdentitySession | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await getPostgresPool().query<IdentitySessionRow>(
    `SELECT
       s.id AS session_id,
       s.user_id,
       u.email,
       u.display_name,
       s.provider,
       s.issued_at,
       s.expires_at
     FROM nexus_identity_sessions s
     JOIN application_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.status = 'active'
       AND s.expires_at > now()
       AND u.status = 'active'
     LIMIT 1`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) {
    await getPostgresPool().query(
      `UPDATE nexus_identity_sessions
          SET status = 'expired'
        WHERE token_hash = $1
          AND status = 'active'
          AND expires_at <= now()`,
      [tokenHash],
    );
    return null;
  }

  await getPostgresPool().query(
    `UPDATE nexus_identity_sessions
        SET last_seen_at = now()
      WHERE id = $1
        AND last_seen_at < now() - interval '5 minutes'`,
    [row.session_id],
  );

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    provider: row.provider,
    issuedAt: iso(row.issued_at),
    expiresAt: iso(row.expires_at),
  };
}

export async function revokeIdentitySession(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;

  const result = await getPostgresPool().query(
    `UPDATE nexus_identity_sessions
        SET status = 'revoked', revoked_at = now()
      WHERE token_hash = $1
        AND status = 'active'`,
    [hashToken(token)],
  );

  return (result.rowCount ?? 0) > 0;
}
