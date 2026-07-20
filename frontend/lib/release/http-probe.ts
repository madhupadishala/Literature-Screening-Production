import { redactForLogs } from "../enterprise/redaction";
import type { HttpProbeDefinition, HttpProbeResult } from "./types";

export async function executeHttpProbe(
  definition: HttpProbeDefinition,
  options: { baseUrl: string; token?: string; timeoutMs: number },
): Promise<HttpProbeResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    definition.timeoutMs ?? options.timeoutMs,
  );

  try {
    const response = await fetch(new URL(definition.path, options.baseUrl), {
      method: definition.method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/html;q=0.9",
        ...(options.token ? { "x-monitoring-token": options.token } : {}),
      },
    });

    const sample = await readResponseSample(response);
    const passed = definition.expectedStatuses.includes(response.status);

    return {
      id: definition.id,
      title: definition.title,
      passed,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      message: passed
        ? `Received expected HTTP ${response.status}.`
        : `Expected ${definition.expectedStatuses.join(" or ")}, received HTTP ${response.status}.`,
      responseSample: redactForLogs(sample),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Probe timed out."
        : error instanceof Error
          ? error.message
          : "Probe failed.";

    return {
      id: definition.id,
      title: definition.title,
      passed: false,
      latencyMs: Math.round(performance.now() - started),
      checkedAt: new Date().toISOString(),
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseSample(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  const text = (await response.text()).slice(0, 2_000);
  if (!text) return undefined;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text.replace(/\s+/g, " ").slice(0, 500);
}
