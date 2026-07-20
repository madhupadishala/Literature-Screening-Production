import { requireInternalMonitoringToken } from "../enterprise/request-guard";
import { getReleaseConfig } from "./release-config";

export function authorizeReleaseRoute(request: Request): void {
  requireInternalMonitoringToken(request);
}

export function resolveProbeBaseUrl(request: Request): string {
  return getReleaseConfig().baseUrl || new URL(request.url).origin;
}

export function readMonitoringToken(request: Request): string | undefined {
  return (
    request.headers.get("x-monitoring-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    undefined
  );
}
