import assert from "node:assert/strict";
import Module from "node:module";

async function main() {
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function qualificationLoad(requestName, parent, isMain) {
    if (requestName === "server-only") return {};
    return originalLoad.call(this, requestName, parent, isMain);
  };

  const { evaluateReleaseGates, latestEvidenceByScenario } = await import(
    "../lib/release/release-gates"
  );
  const { RELEASE_CHECKLIST } = await import("../lib/release/release-checklist");

  const latest = latestEvidenceByScenario([
    evidence("UAT-PV-001", "failed", "2026-08-15T08:00:00.000Z"),
    evidence("UAT-PV-001", "passed", "2026-08-14T08:00:00.000Z"),
  ]);
  assert.equal(latest.get("UAT-PV-001")?.outcome, "failed",
    "latest UAT evidence must win regardless of array ordering");

  const checklist = Object.fromEntries(RELEASE_CHECKLIST.map((item) => [item.id, {
    id: item.id,
    status: "waived" as const,
  }]));
  const gates = evaluateReleaseGates({
    environment: { passed: true, checkedAt: new Date().toISOString(), items: [] },
    enterpriseConfigurationValid: true,
    health: {
      service: "qualification",
      version: "1.0.0",
      environment: "test",
      status: "healthy",
      checkedAt: new Date().toISOString(),
      uptimeSeconds: 1,
      checks: [],
    },
    scenarios: [],
    state: {
      version: 1,
      updatedAt: new Date().toISOString(),
      checklist,
      uatEvidence: [],
      smokeRuns: [{
        id: "smoke-qualification",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executedBy: "qualification",
        passed: true,
        manifestHash: "qualification",
        results: [],
      }],
      candidates: [],
    },
  });
  assert.equal(gates.find((gate) => gate.id === "release-checklist")?.status, "pending",
    "PV/QA sign-off and release-owner approval must not be bypassed by waivers");
  assert.equal(RELEASE_CHECKLIST.find((item) => item.id === "uat-signoff")?.waivable, false);
  assert.equal(RELEASE_CHECKLIST.find(
    (item) => item.id === "release-owner-approval")?.waivable, false);

  console.log(JSON.stringify({
    qualified: true,
    productionCandidateDecision: "BLOCKED_PENDING_DEPLOYMENT_AND_GOVERNANCE_EVIDENCE",
    verified: [
      "latest UAT evidence is selected by execution time",
      "PV/QA UAT sign-off cannot be waived",
      "release-owner approval cannot be waived",
    ],
  }, null, 2));
}

function evidence(scenarioId: string, outcome: "passed" | "failed", executedAt: string) {
  return {
    id: `${scenarioId}-${outcome}`,
    scenarioId,
    mode: "manual" as const,
    outcome,
    executedAt,
    executedBy: "qualification",
    manifestHash: "qualification",
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
