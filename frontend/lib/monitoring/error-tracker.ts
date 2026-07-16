export type ApplicationSeverity =
  | "info"
  | "warning"
  | "error"
  | "critical";

export interface ApplicationErrorRecord {
  id: string;

  tenantId?: string;

  severity: ApplicationSeverity;

  module: string;

  operation: string;

  message: string;

  stack?: string;

  metadata?: Record<string, unknown>;

  timestamp: string;
}

const errorStore = new Map<
  string,
  ApplicationErrorRecord
>();

function createErrorId(): string {
  return `err-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export class ErrorTracker {
  capture(
    error: Omit<
      ApplicationErrorRecord,
      "id" | "timestamp"
    >,
  ): ApplicationErrorRecord {
    const record: ApplicationErrorRecord = {
      ...error,

      id: createErrorId(),

      timestamp: new Date().toISOString(),
    };

    errorStore.set(record.id, record);

    return record;
  }

  list(
    severity?: ApplicationSeverity,
  ): ApplicationErrorRecord[] {
    const records = Array.from(
      errorStore.values(),
    );

    if (!severity) {
      return records;
    }

    return records.filter(
      (record) =>
        record.severity === severity,
    );
  }

  latest(
    count = 10,
  ): ApplicationErrorRecord[] {
    return Array.from(errorStore.values())
      .sort((a, b) =>
        b.timestamp.localeCompare(
          a.timestamp,
        ),
      )
      .slice(0, count);
  }

  countBySeverity(): Record<
    ApplicationSeverity,
    number
  > {
    return {
      info: this.list("info").length,

      warning: this.list("warning")
        .length,

      error: this.list("error").length,

      critical: this.list("critical")
        .length,
    };
  }

  clear(): void {
    errorStore.clear();
  }
}

export const errorTracker =
  new ErrorTracker();