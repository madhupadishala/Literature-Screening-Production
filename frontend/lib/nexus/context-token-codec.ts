import { createHmac, timingSafeEqual } from "node:crypto";

import { isNexusEnvironment, type NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { isNexusModuleKey, type NexusModuleKey } from "@/lib/nexus/modules";

export interface ScopedContextPayload {
  sessionId: string;
  userId: string;
  tenantId: string;
  workspaceId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  issuedAt: string;
  expiresAt: string;
}

function signingKey(secret: string): string {
  if (secret.trim().length < 32) {
    throw new Error("Context signing secret must contain at least 32 characters.");
  }
  return createHmac("sha256", secret).update("nexus-scoped-context-v2").digest("hex");
}

function sign(encoded: string, secret: string): string {
  return createHmac("sha256", signingKey(secret)).update(encoded).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encodeScopedContext(
  input: Omit<ScopedContextPayload, "issuedAt" | "expiresAt">,
  secret: string,
  options?: { now?: Date; expiresInSeconds?: number },
): string {
  const issuedAt = options?.now ?? new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (options?.expiresInSeconds ?? 30 * 60) * 1000,
  );
  const payload: ScopedContextPayload = {
    ...input,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function decodeScopedContext(
  token: string,
  secret: string,
  now = new Date(),
): ScopedContextPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, secret);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<ScopedContextPayload>;

    if (
      !payload.sessionId ||
      !payload.userId ||
      !payload.tenantId ||
      !payload.workspaceId ||
      !payload.environment ||
      !payload.moduleKey ||
      !payload.issuedAt ||
      !payload.expiresAt ||
      !isNexusEnvironment(payload.environment) ||
      !isNexusModuleKey(payload.moduleKey)
    ) {
      return null;
    }

    const expiresAtMs = new Date(payload.expiresAt).getTime();
    const issuedAtMs = new Date(payload.issuedAt).getTime();
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(issuedAtMs)) return null;
    if (expiresAtMs <= now.getTime()) return null;
    if (issuedAtMs > now.getTime() + 60_000) return null;

    return payload as ScopedContextPayload;
  } catch {
    return null;
  }
}
