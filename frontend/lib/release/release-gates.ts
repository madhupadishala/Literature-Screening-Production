import type { HealthReport } from "../enterprise/types";
import { RELEASE_CHECKLIST } from "./release-checklist";
import type {
  EnvironmentContractReport,
  ReleaseGate,
  ReleaseState,
  UatEvidence,
  UatScenario,
} from "./types";

export function evaluateReleaseGates(input: {
  environment: EnvironmentContractReport;
  enterpriseConfigurationValid: boolean;
  health: HealthReport;
  scenarios: UatScenario[];
  state: ReleaseState;
}): ReleaseGate[] {
  const latest = latestEvidenceByScenario(input.state.uatEvidence);
  const mandatoryAutomated = input.scenarios.filter(
    (scenario) => scenario.mandatory && scenario.mode === "automated",
  );
  const mandatoryManual = input.scenarios.filter(
    (scenario) => scenario.mandatory && scenario.mode === "manual",
  );
  const automatedPassed = mandatoryAutomated.every(
    (scenario) => latest.get(scenario.id)?.outcome === "passed",
  );
  const manualPassed = mandatoryManual.every(
    (scenario) => latest.get(scenario.id)?.outcome === "passed",
  );
  const latestSmoke = input.state.smokeRuns[0];
  const mandatoryChecklist = RELEASE_CHECKLIST.filter((item) => item.mandatory);
  const checklistPassed = mandatoryChecklist.every((item) => {
    const status = input.state.checklist[item.id]?.status || "pending";
    return status === "passed" || status === "waived";
  });
  const criticalHealthFailures = input.health.checks.filter(
    (check) => check.critical && check.status !== "healthy",
  );
  const nonCriticalHealthIssues = input.health.checks.filter(
    (check) => !check.critical && check.status !== "healthy",
  );
  const criticalHealthPassed = criticalHealthFailures.length === 0;

  return [
    gate(
      "environment-contract",
      "Release environment contract",
      input.environment.passed ? "passed" : "failed",
      true,
      input.environment.passed
        ? "Critical release environment requirements are satisfied."
        : "One or more critical environment requirements failed.",
      input.environment,
    ),
    gate(
      "enterprise-configuration",
      "Enterprise configuration",
      input.enterpriseConfigurationValid ? "passed" : "failed",
      true,
      input.enterpriseConfigurationValid
        ? "Sprint 5 enterprise configuration is valid."
        : "Sprint 5 enterprise configuration has blocking issues.",
    ),
    gate(
      "dependency-health",
      "Critical dependency health",
      criticalHealthPassed ? "passed" : "failed",
      true,
      criticalHealthPassed
        ? nonCriticalHealthIssues.length > 0
          ? `All critical dependencies are healthy; ${nonCriticalHealthIssues.length} noncritical dependency issue(s) remain.`
          : "All critical dependencies are healthy."
        : `${criticalHealthFailures.length} critical dependency check(s) are not healthy.`,
      {
        criticalFailures: criticalHealthFailures,
        nonCriticalIssues: nonCriticalHealthIssues,
      },
    ),
    gate(
      "automated-uat",
      "Automated UAT",
      automatedPassed ? "passed" : "pending",
      true,
      `${countPassed(mandatoryAutomated, latest)} of ${mandatoryAutomated.length} mandatory automated scenarios passed.`,
    ),
    gate(
      "manual-pv-uat",
      "Manual PV UAT",
      manualPassed ? "passed" : "pending",
      true,
      `${countPassed(mandatoryManual, latest)} of ${mandatoryManual.length} mandatory manual scenarios passed.`,
    ),
    gate(
      "smoke-suite",
      "Release smoke suite",
      latestSmoke ? (latestSmoke.passed ? "passed" : "failed") : "pending",
      true,
      latestSmoke
        ? `Latest smoke run ${latestSmoke.id} ${latestSmoke.passed ? "passed" : "failed"}.`
        : "No smoke run has been recorded.",
      latestSmoke,
    ),
    gate(
      "release-checklist",
      "Release checklist",
      checklistPassed ? "passed" : "pending",
      true,
      `${mandatoryChecklist.filter((item) => {
        const status = input.state.checklist[item.id]?.status || "pending";
        return status === "passed" || status === "waived";
      }).length} of ${mandatoryChecklist.length} mandatory checklist items are complete.`,
    ),
  ];
}

export function latestEvidenceByScenario(
  evidence: UatEvidence[],
): Map<string, UatEvidence> {
  const latest = new Map<string, UatEvidence>();
  for (const item of evidence) {
    if (!latest.has(item.scenarioId)) latest.set(item.scenarioId, item);
  }
  return latest;
}

function countPassed(
  scenarios: UatScenario[],
  evidence: Map<string, UatEvidence>,
): number {
  return scenarios.filter((scenario) => evidence.get(scenario.id)?.outcome === "passed").length;
}

function gate(
  id: string,
  title: string,
  status: ReleaseGate["status"],
  mandatory: boolean,
  message: string,
  details?: unknown,
): ReleaseGate {
  return { id, title, status, mandatory, message, details };
}
