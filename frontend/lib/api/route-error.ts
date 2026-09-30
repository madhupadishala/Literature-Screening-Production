import { authorizationResponse } from "@/lib/rbac/guard";

function explicitStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return value === 400 || value === 401 || value === 403 || value === 404 || value === 409
    ? value
    : null;
}

function inferredStatus(message: string): number {
  if (/version conflict|idempotency conflict|acknowledgement conflict|submission conflict|already exists/i.test(message)) {
    return 409;
  }
  if (/not found/i.test(message)) return 404;
  if (
    /required|invalid|select|cannot|maximum|supports|unsupported|validation failed|must contain|must be|cannot precede|not eligible/i.test(
      message,
    )
  ) {
    return 400;
  }
  return 500;
}

function publicMessage(status: number): string {
  switch (status) {
    case 400:
      return "Invalid request.";
    case 401:
      return "Authentication required.";
    case 403:
      return "Access denied.";
    case 404:
      return "Requested resource was not found.";
    case 409:
      return "Request conflicts with existing state.";
    default:
      return "Unexpected request failure.";
  }
}

export function routeErrorResponse(error: unknown): Response {
  const authorization = authorizationResponse(error);
  if (authorization) return authorization;

  const internalMessage =
    error instanceof Error ? error.message : "Unexpected request failure.";
  const status = explicitStatus(error) ?? inferredStatus(internalMessage);

  return Response.json(
    {
      success: false,
      error: publicMessage(status),
      code:
        status === 401
          ? "AUTHENTICATION_REQUIRED"
          : status === 403
            ? "ACCESS_DENIED"
            : status === 409
              ? "CONFLICT"
              : status === 400
                ? "INVALID_REQUEST"
                : status === 404
                  ? "NOT_FOUND"
                  : "INTERNAL_ERROR",
    },
    { status },
  );
}
