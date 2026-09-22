import { createHash } from "node:crypto";

export type ReliabilitySeverity = "INFO" | "WARNING" | "CRITICAL";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function classifyAiFailureRate(input: {
  executions: number;
  failures: number;
}): { severity?: ReliabilitySeverity; ratePercent: number } {
  const executions = Math.max(0, input.executions);
  const failures = Math.max(0, input.failures);
  const ratePercent =
    executions > 0
      ? Math.round((failures / executions) * 10000) / 100
      : 0;

  if (executions < 5) return { ratePercent };
  if (ratePercent >= 50) return { severity: "CRITICAL", ratePercent };
  if (ratePercent >= 20) return { severity: "WARNING", ratePercent };
  return { ratePercent };
}

export function verifyStoredContentHash(input: {
  content: string;
  expectedSha256: string;
}): boolean {
  return sha256Text(input.content) === input.expectedSha256;
}
