import { createId } from "../enterprise/id";
import { executeHttpProbe } from "./http-probe";
import { buildReleaseManifest } from "./release-manifest";
import { getReleaseConfig } from "./release-config";
import { appendUatEvidenceBatch } from "./release-state-store";
import { UAT_SCENARIOS } from "./uat-catalog";
import type { HttpProbeDefinition, UatEvidence } from "./types";

export async function runAutomatedUat(options: {
  baseUrl: string;
  token?: string;
  scenarioIds?: string[];
  executedBy?: string;
}): Promise<UatEvidence[]> {
  const config = getReleaseConfig();
  const manifest = buildReleaseManifest();
  const selected = UAT_SCENARIOS.filter(
    (scenario) =>
      scenario.mode === "automated" &&
      (!options.scenarioIds?.length || options.scenarioIds.includes(scenario.id)),
  );

  const evidence = await Promise.all(
    selected.map(async (scenario): Promise<UatEvidence> => {
      const result = await executeHttpProbe(toProbe(scenario), {
        baseUrl: options.baseUrl,
        token: options.token,
        timeoutMs: config.requestTimeoutMs,
      });

      return {
        id: createId("uat"),
        scenarioId: scenario.id,
        mode: "automated",
        outcome: result.passed ? "passed" : "failed",
        executedAt: result.checkedAt,
        executedBy: options.executedBy || config.operator,
        notes: result.message,
        result,
        manifestHash: manifest.manifestHash,
      };
    }),
  );

  await appendUatEvidenceBatch(evidence);
  return evidence;
}

function toProbe(scenario: (typeof UAT_SCENARIOS)[number]): HttpProbeDefinition {
  if (!scenario.endpoint || !scenario.method || !scenario.expectedStatuses) {
    throw new Error(`Automated UAT scenario ${scenario.id} is incomplete.`);
  }

  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    category: scenario.category,
    path: scenario.endpoint,
    method: scenario.method,
    expectedStatuses: scenario.expectedStatuses,
    mandatory: scenario.mandatory,
  };
}
