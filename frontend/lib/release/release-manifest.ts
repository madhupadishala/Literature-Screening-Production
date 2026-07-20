import { createHash } from "node:crypto";
import { getRuntimeConfig } from "../enterprise/environment";
import { getReleaseConfig } from "./release-config";
import type { ReleaseManifest } from "./types";

const INCLUDED_CAPABILITIES = [
  "Evidence Package",
  "Hits AI",
  "Duplicate Detection",
  "Screening AI",
  "Human Review",
  "Intake Input Builder",
  "Governed intake_input.json export",
  "Enterprise monitoring and security",
];

const EXCLUDED_CAPABILITIES = [
  "Intake workspace",
  "Case processing",
  "Case QC",
  "Regulatory submission",
  "PV Nexus case-management functions",
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
      "Literature Screening terminates at governed intake_input.json generation.",
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
