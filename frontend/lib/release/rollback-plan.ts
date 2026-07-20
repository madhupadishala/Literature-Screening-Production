import type { RollbackPlan } from "./types";

export function getDefaultRollbackPlan(): RollbackPlan {
  return {
    triggerConditions: [
      "Readiness endpoint becomes unhealthy after deployment.",
      "AI execution failure rate materially exceeds the validated baseline.",
      "Tenant isolation, audit integrity or sensitive-data controls fail.",
      "Evidence Package, Hits, Screening or intake_input.json generation is corrupted.",
      "A critical production defect has no safe forward fix within the release window.",
    ],
    immediateActions: [
      "Stop further production traffic or disable the affected release route.",
      "Capture request IDs, build SHA, monitoring snapshot and security events.",
      "Redeploy the last approved release candidate.",
      "Restore compatible configuration and governed knowledge versions.",
      "Open a deviation and preserve all release and UAT evidence.",
    ],
    validationSteps: [
      "Confirm /api/health/live returns healthy.",
      "Confirm /api/health/ready passes all critical dependencies.",
      "Run the Sprint 6 smoke suite against the restored build.",
      "Verify one governed Evidence → Hits → Screening → intake_input.json workflow.",
      "Confirm audit events and tenant boundaries remain intact.",
    ],
    ownerRoles: ["Release Manager", "Engineering Lead", "PV Product Owner", "Quality"],
    targetRecoveryMinutes: 30,
  };
}
