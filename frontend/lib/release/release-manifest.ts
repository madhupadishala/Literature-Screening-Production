import { createHash } from "node:crypto";
import { getRuntimeConfig } from "../enterprise/environment";
import { getReleaseConfig } from "./release-config";
import type { ReleaseManifest } from "./types";

const INCLUDED_CAPABILITIES = [
  "Literature Search, Evidence, Hits and Screening",
  "Governed Literature-to-Intake handoff",
  "Environment-scoped Nexus module entitlements and RBAC",
  "Canonical Intake sources, source review and human-confirmed extraction",
  "ICSR validity, seriousness and triage",
  "Duplicate and follow-up review",
  "Governed Intake disposition",
  "L2A Nexus Case Processing",
  "QC and Medical Review",
  "Immutable case finalization and version history",
  "Case Evidence Packages",
  "Controlled Nexus JSON, E2B(R3) mapping JSON and human-readable exports",
  "Enterprise monitoring, security and immutable audit trail",
];

const EXCLUDED_CAPABILITIES = [
  "Validated regional E2B XML generation",
  "Regulatory gateway transmission and acknowledgement handling",
  "Embedded proprietary MedDRA or WHODrug dictionary content",
];

export function buildReleaseManifest(now = new Date()): ReleaseManifest {
  const runtime = getRuntimeConfig();
  const release = getReleaseConfig();
  const unsigned = {
    application: runtime.appName,
    version: release.releaseVersion,
    releaseName: release.releaseName,
    buildSha: runtime.buildSha,
    environment: runtime.environment,
    region: runtime.region,
    generatedAt: now.toISOString(),
    architectureBoundary:
      "Nexus RC1 integrates Literature, Intake and Case Processing in one governed platform; Literature remains an upstream safety source and regulated submission gateway transmission remains outside this release.",
    includedCapabilities: INCLUDED_CAPABILITIES,
    excludedCapabilities: EXCLUDED_CAPABILITIES,
  };

  return {
    ...unsigned,
    manifestHash: hashManifest(unsigned),
  };
}

export function verifyReleaseManifest(manifest: ReleaseManifest): boolean {
  const { manifestHash, ...unsigned } = manifest;
  return manifestHash === hashManifest(unsigned);
}

function hashManifest(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)]),
  );
}
