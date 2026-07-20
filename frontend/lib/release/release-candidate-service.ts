import { createId } from "../enterprise/id";
import { ValidationError } from "../enterprise/errors";
import { getDefaultRollbackPlan } from "./rollback-plan";
import { getReleaseConfig } from "./release-config";
import { getReleaseReadinessReport } from "./release-readiness-service";
import { appendReleaseCandidate } from "./release-state-store";
import type { ReleaseCandidate } from "./types";

export async function createReleaseCandidate(
  createdBy?: string,
): Promise<ReleaseCandidate> {
  const report = await getReleaseReadinessReport();
  const config = getReleaseConfig();

  if (!report.ready) {
    throw new ValidationError("Release candidate creation is blocked by incomplete gates.", {
      gates: report.gates,
    });
  }

  const candidate: ReleaseCandidate = {
    id: createId("rc"),
    releaseName: report.manifest.releaseName,
    version: report.manifest.version,
    buildSha: report.manifest.buildSha,
    manifestHash: report.manifest.manifestHash,
    createdAt: new Date().toISOString(),
    createdBy: createdBy?.trim() || config.operator,
    status: "candidate",
    gateSnapshot: report.gates,
    rollbackPlan: getDefaultRollbackPlan(),
  };

  await appendReleaseCandidate(candidate);
  return candidate;
}
