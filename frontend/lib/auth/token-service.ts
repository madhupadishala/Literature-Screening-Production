import type {
  AuthProvider,
  AuthTokenPayload,
  UserRole,
} from "./auth-types";

function encodeToken(payload: AuthTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeToken(token: string): AuthTokenPayload | null {
  try {
    return JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export interface CreateTokenInput {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: UserRole;
  provider: AuthProvider;
  expiresInMinutes?: number;
}

class TokenService {
  createAccessToken(input: CreateTokenInput) {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);

    expiresAt.setMinutes(
      expiresAt.getMinutes() + (input.expiresInMinutes ?? 60),
    );

    return encodeToken({
      sessionId: input.sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      provider: input.provider,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  createRefreshToken(input: CreateTokenInput) {
    return this.createAccessToken({
      ...input,
      expiresInMinutes: input.expiresInMinutes ?? 60 * 24 * 7,
    });
  }

  decode(token: string) {
    return decodeToken(token);
  }

  isExpired(token: string) {
    const payload = decodeToken(token);

    if (!payload) {
      return true;
    }

    return new Date(payload.expiresAt).getTime() <= Date.now();
  }

  validate(token: string) {
    const payload = decodeToken(token);

    if (!payload || this.isExpired(token)) {
      return null;
    }

    return payload;
  }
}

export const tokenService = new TokenService();