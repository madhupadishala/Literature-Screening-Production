import { createId, sanitizeIdentifier } from "./id";
import type { RequestContext } from "./types";

export function extractClientIp(request: Request): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return sanitizeIdentifier(forwardedFor.split(",")[0], 64);
  }

  return sanitizeIdentifier(request.headers.get("x-real-ip"), 64);
}

export function createRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  const requestId =
    sanitizeIdentifier(request.headers.get("x-request-id")) || createId("req");
  const correlationId =
    sanitizeIdentifier(request.headers.get("x-correlation-id")) || requestId;

  return {
    requestId,
    correlationId,
    tenantId: sanitizeIdentifier(request.headers.get("x-tenant-id")),
    packageId: sanitizeIdentifier(request.headers.get("x-package-id")),
    method: request.method.toUpperCase(),
    path: url.pathname,
    clientIp: extractClientIp(request),
    startedAt: new Date().toISOString(),
  };
}
