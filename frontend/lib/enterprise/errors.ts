export interface AppErrorOptions {
  code: string;
  statusCode: number;
  expose?: boolean;
  retryable?: boolean;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.expose = options.expose ?? false;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      expose: true,
      details,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(message, {
      code: "UNAUTHORIZED",
      statusCode: 401,
      expose: true,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "The operation is not permitted.") {
    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
      expose: true,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super("Request rate limit exceeded.", {
      code: "RATE_LIMITED",
      statusCode: 429,
      expose: true,
      retryable: true,
      details: { retryAfterSeconds },
    });
  }
}

export class DependencyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, {
      code: "DEPENDENCY_FAILURE",
      statusCode: 503,
      expose: false,
      retryable: true,
      details,
    });
  }
}

export class OperationTimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} exceeded its ${timeoutMs} ms timeout.`, {
      code: "OPERATION_TIMEOUT",
      statusCode: 504,
      expose: false,
      retryable: true,
      details: { operation, timeoutMs },
    });
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    return new AppError(error.message || "Unexpected application error.", {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      expose: false,
      details: { name: error.name, stack: error.stack },
    });
  }

  return new AppError("Unexpected application error.", {
    code: "INTERNAL_ERROR",
    statusCode: 500,
    expose: false,
    details: { error },
  });
}
