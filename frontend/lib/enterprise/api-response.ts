import { NextResponse } from "next/server";
import { normalizeError } from "./errors";
import { loggerForRequest } from "./logger";
import { metrics } from "./metrics";
import { createRequestContext } from "./request-context";
import type { RequestContext } from "./types";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId?: string;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
  requestId?: string;
}

export function successResponse<T>(
  data: T,
  status = 200,
  requestId?: string,
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    { ok: true, data, requestId },
    {
      status,
      headers: {
        "cache-control": "no-store, max-age=0",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
    },
  );
}

export function failureResponse(
  error: unknown,
  context?: RequestContext,
): NextResponse<ApiFailure> {
  const normalized = normalizeError(error);
  const message = normalized.expose
    ? normalized.message
    : "The request could not be completed safely.";

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: normalized.code,
        message,
        retryable: normalized.retryable,
        details: normalized.expose ? normalized.details : undefined,
      },
      requestId: context?.requestId,
    },
    {
      status: normalized.statusCode,
      headers: {
        "cache-control": "no-store, max-age=0",
        ...(context?.requestId ? { "x-request-id": context.requestId } : {}),
      },
    },
  );
}

export async function runRoute(
  request: Request,
  handler: (context: RequestContext) => Promise<Response>,
): Promise<Response> {
  const context = createRequestContext(request);
  const requestLogger = loggerForRequest(context);
  const started = performance.now();

  metrics.increment("api_requests_total");

  try {
    const response = await handler(context);
    const durationMs = performance.now() - started;

    metrics.observe("api_request_duration_ms", durationMs);
    metrics.increment(
      response.status >= 500
        ? "api_responses_5xx_total"
        : response.status >= 400
          ? "api_responses_4xx_total"
          : "api_responses_success_total",
    );

    requestLogger.info("API request completed.", {
      statusCode: response.status,
      durationMs: Math.round(durationMs),
    });

    const headers = new Headers(response.headers);
    headers.set("x-request-id", context.requestId);
    headers.set("cache-control", headers.get("cache-control") || "no-store, max-age=0");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    const durationMs = performance.now() - started;
    const normalized = normalizeError(error);

    metrics.observe("api_request_duration_ms", durationMs);
    metrics.increment("api_request_failures_total");

    requestLogger.error("API request failed.", {
      error: normalized,
      statusCode: normalized.statusCode,
      durationMs: Math.round(durationMs),
    });

    return failureResponse(normalized, context);
  }
}
