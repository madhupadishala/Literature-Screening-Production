import { CircuitBreaker } from "./circuit-breaker";
import { validateRuntimeConfiguration } from "./config-validator";
import { OperationTimeoutError } from "./errors";
import { InMemoryRateLimiter } from "./rate-limiter";
import { redactForLogs } from "./redaction";
import { retry } from "./retry";
import { withTimeout } from "./timeout";
import type { SelfTestCheck, SelfTestReport } from "./types";

export async function runEnterpriseSelfTest(): Promise<SelfTestReport> {
  const checks: SelfTestCheck[] = [];

  const redacted = redactForLogs({
    authorization: "Bearer secret-token",
    nested: { email: "person@example.com", safe: "visible" },
  });
  const redactedText = JSON.stringify(redacted);
  checks.push({
    name: "sensitive-data-redaction",
    passed:
      !redactedText.includes("secret-token") &&
      !redactedText.includes("person@example.com") &&
      redactedText.includes("visible"),
    details: redacted,
  });

  const limiter = new InMemoryRateLimiter();
  const first = limiter.check("self-test", 1, 60_000);
  const second = limiter.check("self-test", 1, 60_000);
  checks.push({
    name: "rate-limiter",
    passed: first.allowed && !second.allowed,
    details: { first, second },
  });

  let retryAttempts = 0;
  const retryResult = await retry(
    async () => {
      retryAttempts += 1;
      if (retryAttempts < 3) throw new Error("expected self-test failure");
      return "recovered";
    },
    { attempts: 3, initialDelayMs: 1, maximumDelayMs: 2, jitterRatio: 0 },
  );
  checks.push({
    name: "retry-policy",
    passed: retryResult === "recovered" && retryAttempts === 3,
    details: { retryResult, retryAttempts },
  });

  const breaker = new CircuitBreaker("self_test", {
    failureThreshold: 1,
    recoveryTimeoutMs: 60_000,
  });
  try {
    await breaker.execute(async () => {
      throw new Error("expected breaker failure");
    });
  } catch {
    // Expected.
  }
  checks.push({
    name: "circuit-breaker",
    passed: breaker.status().state === "open",
    details: breaker.status(),
  });

  let timeoutPassed = false;
  try {
    await withTimeout(
      "self-test timeout",
      new Promise((resolve) => setTimeout(resolve, 20)),
      1,
    );
  } catch (error) {
    timeoutPassed = error instanceof OperationTimeoutError;
  }
  checks.push({
    name: "timeout-policy",
    passed: timeoutPassed,
    details: { timeoutPassed },
  });

  const configuration = validateRuntimeConfiguration();
  checks.push({
    name: "runtime-configuration",
    passed: configuration.valid,
    details: configuration,
  });

  return {
    passed: checks.every((check) => check.passed),
    checkedAt: new Date().toISOString(),
    checks,
  };
}
