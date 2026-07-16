import { tokenService } from "./token-service";
import type {
  AuthSession,
  AuthUser,
  CreateSessionInput,
  SessionResponse,
} from "./auth-types";

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function permissionsForRole(role: AuthUser["role"]) {
  if (role === "super_admin") {
    return ["*"];
  }

  if (role === "client_admin") {
    return [
      "tenant:read",
      "tenant:write",
      "jobs:read",
      "jobs:write",
      "scheduler:read",
      "scheduler:write",
      "reports:read",
    ];
  }

  if (role === "super_user") {
    return [
      "jobs:read",
      "jobs:write",
      "scheduler:read",
      "reports:read",
      "review:write",
    ];
  }

  if (role === "qc") {
    return ["jobs:read", "review:read", "review:write", "qc:write"];
  }

  if (role === "auditor") {
    return ["audit:read", "reports:read", "review:read"];
  }

  return ["review:read"];
}

class SessionManager {
  private sessions = new Map<string, AuthSession>();

  createSession(input: CreateSessionInput): AuthSession {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 8);

    const role = input.role ?? "super_user";
    const provider = input.provider ?? "internal";

    const user: AuthUser = {
      id: createId("user"),
      email: input.email,
      name: input.name ?? input.email,
      tenantId: input.tenantId,
      role,
      permissions: permissionsForRole(role),
    };

    const sessionId = createId("session");

    const accessToken = tokenService.createAccessToken({
      sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      provider,
      expiresInMinutes: 60,
    });

    const refreshToken = tokenService.createRefreshToken({
      sessionId,
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      provider,
    });

    const session: AuthSession = {
      id: sessionId,
      user,
      provider,
      status: "active",
      accessToken,
      refreshToken,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    if (session.status !== "active") {
      return session;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      const expiredSession: AuthSession = {
        ...session,
        status: "expired",
      };

      this.sessions.set(sessionId, expiredSession);
      return expiredSession;
    }

    return session;
  }

  getSessionFromToken(token: string): AuthSession | null {
    const payload = tokenService.validate(token);

    if (!payload) {
      return null;
    }

    return this.getSession(payload.sessionId);
  }

  refreshSession(refreshToken: string): AuthSession | null {
    const payload = tokenService.validate(refreshToken);

    if (!payload) {
      return null;
    }

    const session = this.getSession(payload.sessionId);

    if (!session || session.status !== "active") {
      return null;
    }

    const accessToken = tokenService.createAccessToken({
      sessionId: session.id,
      userId: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
      provider: session.provider,
    });

    const updatedSession: AuthSession = {
      ...session,
      accessToken,
    };

    this.sessions.set(session.id, updatedSession);
    return updatedSession;
  }

  revokeSession(sessionId: string): AuthSession | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const revokedSession: AuthSession = {
      ...session,
      status: "revoked",
      revokedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, revokedSession);
    return revokedSession;
  }

  getCurrentSessionResponse(token?: string | null): SessionResponse {
    if (!token) {
      return {
        authenticated: false,
        session: null,
      };
    }

    const session = this.getSessionFromToken(token);

    return {
      authenticated: session?.status === "active",
      session,
    };
  }
}

export const sessionManager = new SessionManager();