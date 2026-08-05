import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  AuthProvider,
  AuthTokenPayload,
  UserRole,
} from "./auth-types";

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters. " +
        "Generate one with: openssl rand -base64 48",
    );
  }

  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSigningSecret()).update(payloadB64).digest("base64url");
}

function encodeToken(payload: AuthTokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

function decodeToken(token: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payloadB64);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as AuthTokenPayload;
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

  // Verifies the HMAC signature before returning the payload. A token that
  // fails signature verification (tampered, forged, or signed with a
  // different secret) returns null, same as a malformed token.
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
