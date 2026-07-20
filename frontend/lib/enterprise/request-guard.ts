import { timingSafeEqual } from "node:crypto";
import { getRuntimeConfig } from "./environment";
import { UnauthorizedError, ValidationError } from "./errors";

export function enforceBodySize(
  request: Request,
  maximumBytes = getRuntimeConfig().maxRequestBodyBytes,
): void {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return;

  const contentLength = Number.parseInt(rawLength, 10);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new ValidationError("Request body exceeds the allowed size.", {
      maximumBytes,
      contentLength,
    });
  }
}

export function enforceJsonContentType(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    throw new ValidationError("Content-Type must be application/json.");
  }
}

export async function readJsonBody<T>(
  request: Request,
  maximumBytes = getRuntimeConfig().maxRequestBodyBytes,
): Promise<T> {
  enforceBodySize(request, maximumBytes);
  enforceJsonContentType(request);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new ValidationError("Request body exceeds the allowed size.", {
      maximumBytes,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ValidationError("Request body contains invalid JSON.");
  }
}

export function requireInternalMonitoringToken(request: Request): void {
  const config = getRuntimeConfig();
  const expected = config.internalMonitoringToken;

  if (!expected) {
    if (config.environment === "production") {
      throw new UnauthorizedError("Monitoring access is not configured.");
    }
    return;
  }

  const supplied =
    request.headers.get("x-monitoring-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supplied || !safeEqual(supplied, expected)) {
    throw new UnauthorizedError("Invalid monitoring credentials.");
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
