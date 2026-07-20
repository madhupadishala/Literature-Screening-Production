import { validateRuntimeConfiguration } from "../enterprise/config-validator";
import { registerDefaultDependencyProbes } from "../enterprise/dependency-probes";
import { healthRegistry } from "../enterprise/health-registry";
import { validateReleaseEnvironment } from "./environment-contract";
import { RELEASE_CHECKLIST } from "./release-checklist";
import { evaluateReleaseGates, latestEvidenceByScenario } from "./release-gates";
import { buildReleaseManifest } from "./release-manifest";
import { readReleaseState } from "./release-state-store";
import { UAT_SCENARIOS } from "./uat-catalog";
import type { ReleaseReadinessReport } from "./types";

export async function getReleaseReadinessReport(): Promise<ReleaseReadinessReport> {
  registerDefaultDependencyProbes();

  const [health, state] = await Promise.all([healthRegistry.run(), readReleaseState()]);
  const environment = validateReleaseEnvironment();
  const enterpriseConfiguration = validateRuntimeConfiguration();
  const manifest = buildReleaseManifest();
  const gates = evaluateReleaseGates({
    environment,
    enterpriseConfigurationValid: enterpriseConfiguration.valid,
    health,
    scenarios: UAT_SCENARIOS,
    state,
  });
  const latestMap = latestEvidenceByScenario(state.uatEvidence);
  const latestEvidence = UAT_SCENARIOS.map((scenario) => latestMap.get(scenario.id)).filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );
  const mandatory = UAT_SCENARIOS.filter((scenario) => scenario.mandatory);
  const mandatoryPassed = mandatory.filter(
    (scenario) => latestMap.get(scenario.id)?.outcome === "passed",
  ).length;

  return {
    ready: gates.every(
      (gate) => !gate.mandatory || gate.status === "passed" || gate.status === "waived",
    ),
    checkedAt: new Date().toISOString(),
    manifest,
    environment,
    enterpriseConfiguration,
    health,
    gates,
    checklist: RELEASE_CHECKLIST.map((definition) => ({
      ...definition,
      ...(state.checklist[definition.id] || { id: definition.id, status: "pending" as const }),
    })),
    uat: {
      scenarios: UAT_SCENARIOS,
      latestEvidence,
      mandatoryPassed,
      mandatoryTotal: mandatory.length,
    },
    smoke: state.smokeRuns[0],
    candidates: state.candidates,
  };
}
