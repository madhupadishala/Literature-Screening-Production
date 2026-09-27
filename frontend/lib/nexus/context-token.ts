import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isNexusEnvironment, type NexusEnvironment } from "@/lib/nexus/entitlement-types";
import { isNexusModuleKey, type NexusModuleKey } from "@/lib/nexus/modules";

export const NEXUS_CONTEXT_COOKIE = "clinixai_nexus_context";
export const NEXUS_CONTEXT_MAX_AGE_SECONDS = 30 * 60;

export interface NexusContextTokenPayload {
  userId: string;
  tenantId: string;
  workspaceId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  issuedAt: string;
  expiresAt: string;
}

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return createHmac("sha256", secret).update("nexus-workspace-context-v1").digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createNexusContextToken(input: {
  userId: string;
  tenantId: string;
  workspaceId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  expiresInSeconds?: number;
}): string {
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + (input.expiresInSeconds ?? NEXUS_CONTEXT_MAX_AGE_SECONDS) * 1000,
  );

  const payload: NexusContextTokenPayload = {
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    environment: input.environment,
    moduleKey: input.moduleKey,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function validateNexusContextToken(token: string): NexusContextTokenPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;

  const expected = sign(encoded);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<NexusContextTokenPayload>;

    if (
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

    if (new Date(payload.expiresAt).getTime() <= Date.now()) return null;

    return payload as NexusContextTokenPayload;
  } catch {
    return null;
  }
}
