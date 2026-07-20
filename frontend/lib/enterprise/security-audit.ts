import { getRuntimeConfig } from "./environment";
import { createId } from "./id";
import { logger } from "./logger";
import { metrics } from "./metrics";
import { redactForLogs } from "./redaction";
import type { SecurityAuditEvent } from "./types";

export interface SecurityEventQuery {
  limit?: number;
  type?: string;
  severity?: SecurityAuditEvent["severity"];
  since?: string;
}

export class SecurityAuditStore {
  private readonly events: SecurityAuditEvent[] = [];

  record(
    event: Omit<SecurityAuditEvent, "id" | "occurredAt">,
  ): SecurityAuditEvent {
    const completed: SecurityAuditEvent = {
      ...event,
      id: createId("sec"),
      occurredAt: new Date().toISOString(),
      metadata: redactForLogs(event.metadata),
    };

    this.events.unshift(completed);
    this.events.length = Math.min(
      this.events.length,
      getRuntimeConfig().securityEventRetention,
    );

    metrics.increment(`security_${event.type}_total`);
    metrics.increment(`security_${event.outcome}_total`);

    const logMethod =
      event.severity === "critical" || event.severity === "high"
        ? logger.error.bind(logger)
        : event.severity === "medium"
          ? logger.warn.bind(logger)
          : logger.info.bind(logger);

    logMethod("Security audit event recorded.", completed);
    return completed;
  }

  list(query: SecurityEventQuery = {}): SecurityAuditEvent[] {
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const sinceTimestamp = query.since ? Date.parse(query.since) : Number.NaN;

    return this.events
      .filter((event) => !query.type || event.type === query.type)
      .filter((event) => !query.severity || event.severity === query.severity)
      .filter(
        (event) =>
          Number.isNaN(sinceTimestamp) || Date.parse(event.occurredAt) >= sinceTimestamp,
      )
      .slice(0, limit);
  }

  count(): number {
    return this.events.length;
  }

  clear(): void {
    this.events.length = 0;
  }
}

declare global {
  var __clinixSecurityAuditStore: SecurityAuditStore | undefined;
}

export const securityAudit =
  globalThis.__clinixSecurityAuditStore ??
  (globalThis.__clinixSecurityAuditStore = new SecurityAuditStore());
