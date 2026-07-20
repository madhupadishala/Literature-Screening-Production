import type { HttpProbeDefinition } from "./types";

export const SMOKE_PROBES: HttpProbeDefinition[] = [
  probe("SMOKE-001", "Liveness", "/api/health/live", "Reliability"),
  probe("SMOKE-002", "Readiness", "/api/health/ready", "Reliability"),
  probe("SMOKE-003", "Monitoring", "/api/monitoring/summary", "Monitoring"),
  probe("SMOKE-004", "Workflow service", "/api/workflow/list", "Workflow"),
  probe("SMOKE-005", "Reliability dashboard", "/admin/reliability", "Admin UI"),
  probe("SMOKE-006", "Release-readiness dashboard", "/admin/release-readiness", "Admin UI"),
];

function probe(
  id: string,
  title: string,
  path: string,
  category: string,
): HttpProbeDefinition {
  return {
    id,
    title,
    description: `${title} is reachable on the release candidate.`,
    category,
    path,
    method: "GET",
    expectedStatuses: [200],
    mandatory: true,
  };
}
