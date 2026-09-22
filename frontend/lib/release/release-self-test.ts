import { buildReleaseManifest, verifyReleaseManifest } from "./release-manifest";
import { RELEASE_CHECKLIST } from "./release-checklist";
import { SMOKE_PROBES } from "./smoke-catalog";
import { UAT_SCENARIOS } from "./uat-catalog";

export interface ReleaseSelfTestCheck {
  name: string;
  passed: boolean;
  details?: unknown;
}

export interface ReleaseSelfTestReport {
  passed: boolean;
  checkedAt: string;
  checks: ReleaseSelfTestCheck[];
}

export function runReleaseSelfTest(): ReleaseSelfTestReport {
  const manifest = buildReleaseManifest(new Date("2026-01-01T00:00:00.000Z"));
  const scenarioIds = UAT_SCENARIOS.map((scenario) => scenario.id);
  const smokeIds = SMOKE_PROBES.map((probe) => probe.id);
  const checklistIds = RELEASE_CHECKLIST.map((item) => item.id);

  const checks: ReleaseSelfTestCheck[] = [
    {
      name: "manifest-integrity",
      passed: verifyReleaseManifest(manifest),
      details: { manifestHash: manifest.manifestHash },
    },
    {
      name: "architecture-boundary",
      passed:
        manifest.includedCapabilities.includes("Canonical Intake sources, source review and human-confirmed extraction") &&
        manifest.includedCapabilities.includes("L2A Nexus Case Processing") &&
        manifest.includedCapabilities.includes("QC and Medical Review") &&
        manifest.excludedCapabilities.includes("Regulatory gateway transmission and acknowledgement handling") &&
        manifest.excludedCapabilities.includes("Embedded proprietary MedDRA or WHODrug dictionary content") &&
        !manifest.excludedCapabilities.includes("Case processing"),
      details: {
        included: manifest.includedCapabilities,
        excluded: manifest.excludedCapabilities,
      },
    },
    {
      name: "uat-catalog-unique",
      passed: new Set(scenarioIds).size === scenarioIds.length,
      details: { count: scenarioIds.length },
    },
    {
      name: "smoke-catalog-unique",
      passed: new Set(smokeIds).size === smokeIds.length,
      details: { count: smokeIds.length },
    },
    {
      name: "release-checklist-unique",
      passed: new Set(checklistIds).size === checklistIds.length,
      details: { count: checklistIds.length },
    },
    {
      name: "mandatory-pv-and-nexus-uat-present",
      passed:
        UAT_SCENARIOS.filter(
          (scenario) => scenario.mode === "manual" && scenario.mandatory,
        ).length >= 14 &&
        [
          "UAT-NEXUS-001",
          "UAT-NEXUS-002",
          "UAT-NEXUS-003",
          "UAT-NEXUS-004",
          "UAT-NEXUS-005",
          "UAT-NEXUS-006",
        ].every((id) => scenarioIds.includes(id)),
      details: {
        count: UAT_SCENARIOS.filter(
          (scenario) => scenario.mode === "manual" && scenario.mandatory,
        ).length,
      },
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    checkedAt: new Date().toISOString(),
    checks,
  };
}
