import { getRuntimeConfig } from "./environment";
import { redactForLogs } from "./redaction";
import type { LogLevel, RequestContext } from "./types";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class StructuredLogger {
  constructor(private readonly baseMetadata: unknown = {}) {}

  child(metadata: unknown): StructuredLogger {
    return new StructuredLogger({
      ...(isPlainObject(this.baseMetadata) ? this.baseMetadata : {}),
      ...(isPlainObject(metadata) ? metadata : { metadata }),
    });
  }

  debug(message: string, metadata?: unknown): void {
    this.write("debug", message, metadata);
  }

  info(message: string, metadata?: unknown): void {
    this.write("info", message, metadata);
  }

  warn(message: string, metadata?: unknown): void {
    this.write("warn", message, metadata);
  }

  error(message: string, metadata?: unknown): void {
    this.write("error", message, metadata);
  }

  private write(level: LogLevel, message: string, metadata?: unknown): void {
    const config = getRuntimeConfig();
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[config.logLevel]) return;

    const record = redactForLogs({
      timestamp: new Date().toISOString(),
      level,
      service: config.appName,
      environment: config.environment,
      region: config.region,
      buildSha: config.buildSha,
      message,
      ...(isPlainObject(this.baseMetadata) ? this.baseMetadata : {}),
      ...(isPlainObject(metadata) ? metadata : metadata === undefined ? {} : { metadata }),
    });

    const serialized = JSON.stringify(record);
    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else if (level === "debug") {
      console.debug(serialized);
    } else {
      console.info(serialized);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const logger = new StructuredLogger();

export function loggerForRequest(context: RequestContext): StructuredLogger {
  return logger.child({
    requestId: context.requestId,
    correlationId: context.correlationId,
    tenantId: context.tenantId,
    packageId: context.packageId,
    method: context.method,
    path: context.path,
    clientIp: context.clientIp,
  });
}
