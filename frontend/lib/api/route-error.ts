import { authorizationResponse } from "@/lib/rbac/guard";

export function routeErrorResponse(error: unknown): Response {
  const authorization = authorizationResponse(error);
  if (authorization) return authorization;

  const message = error instanceof Error ? error.message : "Unexpected request failure.";

  const status = /version conflict/i.test(message)
    ? 409
    : /not found/i.test(message)
      ? 404
      : /required|invalid|select|cannot|maximum|supports|validation failed/i.test(message)
        ? 400
        : 500;

  return Response.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}
