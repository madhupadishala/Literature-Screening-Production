import { createId } from "../enterprise/id";
import { executeHttpProbe } from "./http-probe";
import { buildReleaseManifest } from "./release-manifest";
import { getReleaseConfig } from "./release-config";
import { appendSmokeRun } from "./release-state-store";
import { SMOKE_PROBES } from "./smoke-catalog";
import type { SmokeRun } from "./types";

export async function runSmokeSuite(options: {
  baseUrl: string;
  token?: string;
  executedBy?: string;
}): Promise<SmokeRun> {
  const config = getReleaseConfig();
  const manifest = buildReleaseManifest();
  const startedAt = new Date().toISOString();
  const results = await Promise.all(
    SMOKE_PROBES.map((definition) =>
      executeHttpProbe(definition, {
        baseUrl: options.baseUrl,
        token: options.token,
        timeoutMs: config.requestTimeoutMs,
      }),
    ),
  );

  const run: SmokeRun = {
    id: createId("smoke"),
    startedAt,
    completedAt: new Date().toISOString(),
    executedBy: options.executedBy || config.operator,
    passed: results.every((result) => result.passed),
    manifestHash: manifest.manifestHash,
    results,
  };

  await appendSmokeRun(run);
  return run;
}
