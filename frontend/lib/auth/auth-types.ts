export type AuthProvider =
  | "internal"
  | "microsoft_entra"
  | "okta"
  | "auth0"
  | "keycloak"
  | "next_auth";

export type SessionStatus = "active" | "expired" | "revoked";

export type UserRole =
  | "super_admin"
  | "client_admin"
  | "super_user"
  | "qc"
  | "auditor"
  | "read_only";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  permissions: string[];
}

export interface AuthTokenPayload {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  provider: AuthProvider;
  issuedAt: string;
  expiresAt: string;
}

export interface AuthSession {
  id: string;
  user: AuthUser;
  provider: AuthProvider;
  status: SessionStatus;
  accessToken: string;
  refreshToken: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface CreateSessionInput {
  email: string;
  name?: string;
  tenantId: string;
  role?: UserRole;
  provider?: AuthProvider;
}

export interface SessionResponse {
  authenticated: boolean;
  session: AuthSession | null;
}