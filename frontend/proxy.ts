import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConfig } from "./lib/enterprise/environment";
import { createId, sanitizeIdentifier } from "./lib/enterprise/id";
import { metrics } from "./lib/enterprise/metrics";
import { rateLimiter } from "./lib/enterprise/rate-limiter";
import { securityAudit } from "./lib/enterprise/security-audit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function proxy(request: NextRequest): NextResponse {
  const config = getRuntimeConfig();
  const requestId =
    sanitizeIdentifier(request.headers.get("x-request-id")) || createId("req");
  const correlationId =
    sanitizeIdentifier(request.headers.get("x-correlation-id")) || requestId;
  const clientIp = getClientIp(request);
  const pathname = request.nextUrl.pathname;

  const contentLength = Number.parseInt(
    request.headers.get("content-length") || "0",
    10,
  );

  if (
    !SAFE_METHODS.has(request.method) &&
    Number.isFinite(contentLength) &&
    contentLength > config.maxRequestBodyBytes
  ) {
    securityAudit.record({
      type: "oversized-request",
      severity: "medium",
      outcome: "blocked",
      requestId,
      correlationId,
      sourceIp: clientIp,
      path: pathname,
      message: "Request was blocked because its declared payload was too large.",
      metadata: { contentLength, maximumBytes: config.maxRequestBodyBytes },
    });

    return secureJsonResponse(
      {
        ok: false,
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body exceeds the allowed size.",
          retryable: false,
        },
        requestId,
      },
      413,
      requestId,
    );
  }

  if (pathname.startsWith("/api/")) {
    const decision = rateLimiter.check(
      `${clientIp || "unknown"}:${pathname}`,
      config.apiRateLimit,
      config.apiRateLimitWindowMs,
    );

    if (!decision.allowed) {
      metrics.increment("proxy_rate_limited_total");
      securityAudit.record({
        type: "rate-limit",
        severity: "medium",
        outcome: "blocked",
        requestId,
        correlationId,
        sourceIp: clientIp,
        path: pathname,
        message: "API request was rate limited.",
        metadata: decision,
      });

      const response = secureJsonResponse(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Request rate limit exceeded.",
            retryable: true,
          },
          requestId,
        },
        429,
        requestId,
      );
      response.headers.set("retry-after", String(decision.retryAfterSeconds));
      response.headers.set("x-ratelimit-limit", String(decision.limit));
      response.headers.set("x-ratelimit-remaining", String(decision.remaining));
      response.headers.set("x-ratelimit-reset", decision.resetAt);
      return response;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-correlation-id", correlationId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("x-request-id", requestId);
  applySecurityHeaders(response.headers);
  return response;
}

function secureJsonResponse(
  body: unknown,
  status: number,
  requestId: string,
): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-request-id": requestId,
    },
  });
  applySecurityHeaders(response.headers);
  return response;
}

function applySecurityHeaders(headers: Headers): void {
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("content-security-policy", buildContentSecurityPolicy());
}

function buildContentSecurityPolicy(): string {
  const development = process.env.NODE_ENV !== "production";
  const scriptSources = development
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

function getClientIp(request: NextRequest): string | undefined {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return sanitizeIdentifier(
    forwardedFor?.split(",")[0] || request.headers.get("x-real-ip"),
    64,
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
