import "server-only";

import {
  decodeScopedContext,
  encodeScopedContext,
  type ScopedContextPayload,
} from "@/lib/nexus/context-token-codec";
import type { NexusEnvironment } from "@/lib/nexus/entitlement-types";
import type { NexusModuleKey } from "@/lib/nexus/modules";

export const NEXUS_CONTEXT_COOKIE = "nexus_scoped_context";
export const NEXUS_CONTEXT_MAX_AGE_SECONDS = 30 * 60;

export type NexusContextTokenPayload = ScopedContextPayload;

function contextSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function createNexusContextToken(input: {
  sessionId: string;
  userId: string;
  tenantId: string;
  workspaceId: string;
  environment: NexusEnvironment;
  moduleKey: NexusModuleKey;
  expiresInSeconds?: number;
}): string {
  return encodeScopedContext(
    {
      sessionId: input.sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      environment: input.environment,
      moduleKey: input.moduleKey,
    },
    contextSecret(),
    { expiresInSeconds: input.expiresInSeconds ?? NEXUS_CONTEXT_MAX_AGE_SECONDS },
  );
}

export function validateNexusContextToken(token: string): NexusContextTokenPayload | null {
  return decodeScopedContext(token, contextSecret());
}
