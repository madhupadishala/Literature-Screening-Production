import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/database/postgres";
import { tokenService } from "./token-service";
import type { AuthProvider, AuthSession, AuthUser, CreateSessionInput,
  SessionResponse, SessionStatus, UserRole } from "./auth-types";

interface SessionRow {
  id: string; tenant_id: string; user_id: string; email: string; display_name: string;
  provider: AuthProvider; role_name: UserRole; status: SessionStatus;
  issued_at: Date; expires_at: Date; revoked_at: Date | null;
  refresh_token_sha256?: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function permissionsForRole(role: UserRole) {
  if (role === "super_admin") return ["*"];
  if (role === "client_admin") return ["tenant:read", "tenant:write", "jobs:read",
    "jobs:write", "scheduler:read", "scheduler:write", "reports:read"];
  if (role === "super_user") return ["jobs:read", "jobs:write", "scheduler:read",
    "reports:read", "review:write"];
  if (role === "qc") return ["jobs:read", "review:read", "review:write", "qc:write"];
  if (role === "auditor") return ["audit:read", "reports:read", "review:read"];
  return ["review:read"];
}

function mapRow(row: SessionRow, tokens?: { accessToken: string; refreshToken: string }): AuthSession {
  const user: AuthUser = { id: row.user_id, email: row.email, name: row.display_name,
    tenantId: row.tenant_id, role: row.role_name, permissions: permissionsForRole(row.role_name) };
  return { id: row.id, user, provider: row.provider, status: row.status,
    accessToken: tokens?.accessToken, refreshToken: tokens?.refreshToken,
    issuedAt: row.issued_at.toISOString(), expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() };
}

const SESSION_SELECT = `SELECT session.id, session.tenant_id, session.user_id,
  user_account.email, user_account.display_name, session.provider, session.role_name,
  session.status, session.issued_at, session.expires_at, session.revoked_at,
  session.refresh_token_sha256
  FROM authentication_sessions session
  JOIN application_users user_account ON user_account.id = session.user_id`;

export class SessionManager {
  async createSession(input: CreateSessionInput, requestId?: string | null): Promise<AuthSession> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const role = input.role ?? "super_user";
    const provider = input.provider ?? "internal";
    const tokenInput = { sessionId: id, userId: input.userId, tenantId: input.tenantId,
      role, provider };
    const accessToken = tokenService.createAccessToken({ ...tokenInput, expiresInMinutes: 60 });
    const refreshToken = tokenService.createRefreshToken(tokenInput);
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<SessionRow>(
        `INSERT INTO authentication_sessions (id, tenant_id, user_id, provider, role_name,
           refresh_token_sha256, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, tenant_id, user_id, $9::text AS email, $10::text AS display_name,
           provider, role_name, status, issued_at, expires_at, revoked_at`,
        [id, input.tenantId, input.userId, provider, role, hashToken(refreshToken), now,
          expiresAt, input.email, input.name ?? input.email]);
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
           outcome, request_id, details)
         VALUES ($1,$2,'AUTHENTICATION_SESSION_CREATED','SECURITY_AUTHENTICATION',
           'success',$3,$4::jsonb)`,
        [input.tenantId, input.userId, requestId ?? null,
          JSON.stringify({ sessionId: id, provider, expiresAt: expiresAt.toISOString() })]);
      await client.query("COMMIT");
      return mapRow(created.rows[0], { accessToken, refreshToken });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async getSession(sessionId: string): Promise<AuthSession | null> {
    const result = await getPostgresPool().query<SessionRow>(
      `${SESSION_SELECT} WHERE session.id = $1`, [sessionId]);
    const row = result.rows[0];
    if (!row) return null;
    if (row.status === "active" && row.expires_at.getTime() <= Date.now()) {
      const expired = await getPostgresPool().query<SessionRow>(
        `UPDATE authentication_sessions SET status = 'expired'
         WHERE id = $1 AND status = 'active' RETURNING id, tenant_id, user_id,
           $2::text AS email, $3::text AS display_name, provider, role_name, status,
           issued_at, expires_at, revoked_at`, [sessionId, row.email, row.display_name]);
      return expired.rows[0] ? mapRow(expired.rows[0]) : mapRow(row);
    }
    return mapRow(row);
  }

  async getSessionFromToken(token: string): Promise<AuthSession | null> {
    const payload = tokenService.validate(token);
    if (!payload) return null;
    const session = await this.getSession(payload.sessionId);
    if (!session || session.user.id !== payload.userId ||
        session.user.tenantId !== payload.tenantId) return null;
    await getPostgresPool().query(
      `UPDATE authentication_sessions SET last_seen_at = now()
       WHERE id = $1 AND status = 'active'`, [payload.sessionId]);
    return session;
  }

  async refreshSession(refreshToken: string): Promise<AuthSession | null> {
    const payload = tokenService.validate(refreshToken);
    if (!payload) return null;
    const result = await getPostgresPool().query<SessionRow>(
      `${SESSION_SELECT} WHERE session.id = $1
        AND session.status = 'active' AND session.expires_at > now()`, [payload.sessionId]);
    const row = result.rows[0];
    if (!row || row.refresh_token_sha256 !== hashToken(refreshToken) ||
        row.user_id !== payload.userId || row.tenant_id !== payload.tenantId) return null;
    const accessToken = tokenService.createAccessToken({ sessionId: row.id, userId: row.user_id,
      tenantId: row.tenant_id, role: row.role_name, provider: row.provider });
    await getPostgresPool().query(
      `UPDATE authentication_sessions SET refreshed_at = now(), last_seen_at = now()
       WHERE id = $1`, [row.id]);
    return mapRow(row, { accessToken, refreshToken });
  }

  async revokeSession(sessionId: string, requestId?: string | null): Promise<AuthSession | null> {
    const client = await getPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<SessionRow>(`${SESSION_SELECT}
        WHERE session.id = $1 FOR UPDATE OF session`, [sessionId]);
      if (!current.rows[0]) { await client.query("COMMIT"); return null; }
      const row = current.rows[0];
      const revoked = await client.query<SessionRow>(
        `UPDATE authentication_sessions SET status = 'revoked', revoked_at = now()
         WHERE id = $1 RETURNING id, tenant_id, user_id, $2::text AS email,
           $3::text AS display_name, provider, role_name, status, issued_at,
           expires_at, revoked_at`, [sessionId, row.email, row.display_name]);
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, event_type, event_category,
           outcome, request_id, details)
         VALUES ($1,$2,'AUTHENTICATION_SESSION_REVOKED','SECURITY_AUTHENTICATION',
           'success',$3,$4::jsonb)`,
        [row.tenant_id, row.user_id, requestId ?? null, JSON.stringify({ sessionId })]);
      await client.query("COMMIT");
      return mapRow(revoked.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async getCurrentSessionResponse(token?: string | null): Promise<SessionResponse> {
    if (!token) return { authenticated: false, session: null };
    const session = await this.getSessionFromToken(token);
    return { authenticated: session?.status === "active", session };
  }
}

export const sessionManager = new SessionManager();
