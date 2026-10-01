import "server-only";

import type { NextRequest } from "next/server";

export function localAuthBypassEnabled(request: NextRequest): boolean {
  const hostname = request.nextUrl.hostname.toLowerCase();
  const isLocalRequest =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  return (
    process.env.NODE_ENV === "development" &&
    isLocalRequest &&
    process.env.LOCAL_AUTH_BYPASS?.trim().toLowerCase() === "true"
  );
}
