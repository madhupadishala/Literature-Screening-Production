import { authorizationResponse } from "@/lib/rbac/guard";

function explicitStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return value === 401 || value === 403 ? value : null;
}

export function routeErrorResponse(error: unknown): Response {
  const authorization = authorizationResponse(error);
  if (authorization) return authorization;

  const message = error instanceof Error ? error.message : "Unexpected request failure.";
  const statusFromError = explicitStatus(error);

  const status =
    statusFromError ??
    (/version conflict/i.test(message)
      ? 409
      : /not found/i.test(message)
        ? 404
        : /required|invalid|select|cannot|maximum|supports|validation failed/i.test(message)
          ? 400
          : 500);

  return Response.json(
    {
      success: false,
      error: message,
      code:
        status === 401
          ? "AUTHENTICATION_REQUIRED"
          : status === 403
            ? "ACCESS_DENIED"
            : undefined,
    },
    { status },
  );
}
