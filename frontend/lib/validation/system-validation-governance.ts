export type ValidationCheckStatus =
  | "PASS"
  | "FAIL"
  | "NOT_EXECUTED"
  | "MANUAL_REQUIRED";

export interface ValidationControl {
  id: string;
  category:
    | "ARCHITECTURE"
    | "CONFIGURATION"
    | "AUDIT"
    | "INTAKE"
    | "RELIABILITY"
    | "SCHEDULER"
    | "E2E"
    | "CI"
    | "QUALIFICATION";
  requirement: string;
  automated: boolean;
  evidencePaths: string[];
}

export const SYSTEM_VALIDATION_CONTROLS: readonly ValidationControl[] = [
  {
    id: "VAL-ARCH-001",
    category: "ARCHITECTURE",
    requirement:
      "The governed workflow shall persist Search, Hits, Screening, Review / Medical Review and Intake lineage without bypassing required stages.",
    automated: true,
    evidencePaths: [
      "literature_packages",
      "literature_workflow_state",
      "hits_results",
      "screening_results",
      "literature_review_workspaces",
      "intake_input_exports",
    ],
  },
  {
    id: "VAL-CFG-001",
    category: "CONFIGURATION",
    requirement:
      "Production product identification shall use an active governed Product Master.",
    automated: true,
    evidencePaths: ["tenant_configuration_versions:PRODUCT_MASTER"],
  },
  {
    id: "VAL-CFG-002",
    category: "CONFIGURATION",
    requirement:
      "Expectedness and causality shall use active governed Label / RSI and Causality Method configurations.",
    automated: true,
    evidencePaths: [
      "tenant_configuration_versions:LABEL_REFERENCE",
      "tenant_configuration_versions:CAUSALITY_METHOD",
    ],
  },
  {
    id: "VAL-SCHED-001",
    category: "SCHEDULER",
    requirement:
      "Scheduled production surveillance shall be driven by active Search Profiles and Literature Calendar configuration.",
    automated: true,
    evidencePaths: [
      "tenant_configuration_versions:SEARCH_PROFILE",
      "tenant_configuration_versions:LITERATURE_CALENDAR",
      "literature_scheduled_search_runs",
    ],
  },
  {
    id: "VAL-AUDIT-001",
    category: "AUDIT",
    requirement:
      "Controlled workflow and configuration actions shall be retained in the immutable audit event stream.",
    automated: true,
    evidencePaths: ["audit_events"],
  },
  {
    id: "VAL-INTAKE-001",
    category: "INTAKE",
    requirement:
      "Multi-patient Intake shall use explicit patient-product-event relations and immutable case-candidate lineage.",
    automated: true,
    evidencePaths: [
      "literature_intake_case_candidates",
      "intake_input_exports",
      "frontend/lib/literature/intake-input/intake-case-governance.ts",
    ],
  },
  {
    id: "VAL-REL-001",
    category: "RELIABILITY",
    requirement:
      "No unresolved CRITICAL reliability finding may be present at validation-package generation.",
    automated: true,
    evidencePaths: ["reliability_findings", "reliability_snapshots"],
  },
  {
    id: "VAL-E2E-001",
    category: "E2E",
    requirement:
      "A controlled positive synthetic E2E validation shall demonstrate governed Search → Hits → Screening → Review/MR → Intake.",
    automated: true,
    evidencePaths: ["audit_events:SPRINT_6C_AUTONOMOUS_VALIDATION_PASSED"],
  },
  {
    id: "VAL-CI-001",
    category: "CI",
    requirement:
      "The release build shall pass lint, TypeScript, production build and executable governance regression suites.",
    automated: false,
    evidencePaths: [".github/workflows", "frontend/package.json"],
  },
  {
    id: "VAL-IQ-001",
    category: "QUALIFICATION",
    requirement:
      "Installation / deployment qualification shall confirm environment, database connectivity, required secrets, build identity and dependency readiness.",
    automated: false,
    evidencePaths: ["docs/validation/IQ-OQ-PQ-PROTOCOL.md"],
  },
  {
    id: "VAL-OQ-001",
    category: "QUALIFICATION",
    requirement:
      "Operational qualification shall execute positive, negative, boundary, authorization, audit and failure-recovery scenarios.",
    automated: false,
    evidencePaths: ["docs/validation/IQ-OQ-PQ-PROTOCOL.md"],
  },
  {
    id: "VAL-PQ-001",
    category: "QUALIFICATION",
    requirement:
      "Performance qualification / UAT shall be executed by authorized business and Quality representatives using approved acceptance criteria.",
    automated: false,
    evidencePaths: [
      "docs/validation/IQ-OQ-PQ-PROTOCOL.md",
      "docs/validation/RELEASE-HANDOFF-CHECKLIST.md",
    ],
  },
] as const;

export function automatedPackageStatus(
  checks: Array<{ status: ValidationCheckStatus; automated: boolean }>,
): "BLOCKED" | "READY_FOR_QA_REVIEW" {
  return checks.some((check) => check.automated && check.status === "FAIL")
    ? "BLOCKED"
    : "READY_FOR_QA_REVIEW";
}
