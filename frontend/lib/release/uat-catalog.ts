import type { UatScenario } from "./types";

export const UAT_SCENARIOS: UatScenario[] = [
  automated(
    "UAT-AUTO-001",
    "Application liveness",
    "Platform process is running and able to serve requests.",
    "Reliability",
    "/api/health/live",
  ),
  automated(
    "UAT-AUTO-002",
    "Critical dependency readiness",
    "Critical dependencies required for Literature Screening are ready.",
    "Reliability",
    "/api/health/ready",
  ),
  automated(
    "UAT-AUTO-003",
    "Monitoring summary",
    "Enterprise monitoring returns service, dependency and process information.",
    "Monitoring",
    "/api/monitoring/summary",
  ),
  automated(
    "UAT-AUTO-004",
    "Performance self-test",
    "Sprint 4 performance controls pass their registered self-test.",
    "Performance",
    "/api/system/performance/self-test",
  ),
  automated(
    "UAT-AUTO-005",
    "AI self-test",
    "AI runtime integration and provider controls pass their self-test.",
    "AI",
    "/api/ai/self-test",
  ),
  automated(
    "UAT-AUTO-006",
    "Workflow list availability",
    "The Literature workflow service can return governed package workflow records.",
    "Workflow",
    "/api/workflow/list",
  ),
  manual(
    "UAT-PV-001",
    "Product identity and MAH validation",
    "Validate Brand, Generic/API/INN, synonyms and active MAH logic against an approved test package.",
    "PV Logic",
    [
      "Company product is identified from approved product-master terms.",
      "Active MAH is evaluated for the country of incidence.",
      "Decision explanation cites governed evidence and does not invent product identity.",
    ],
  ),
  manual(
    "UAT-PV-002",
    "HIT neutrality",
    "Confirm all publication types enter the HIT queue before screening decisions are applied.",
    "Hits",
    [
      "Case reports, trials, reviews, letters, animal and in-vitro records are retained at HIT stage.",
      "No publication is silently discarded by publication type during HIT generation.",
    ],
  ),
  manual(
    "UAT-PV-003",
    "Duplicate consolidation",
    "Confirm duplicate sources are consolidated into one article workspace with source identity preserved.",
    "Evidence",
    [
      "PMID, DOI and publisher identifiers remain traceable.",
      "Duplicate evidence is merged without losing provenance.",
    ],
  ),
  manual(
    "UAT-PV-004",
    "Screening validity and decision",
    "Validate patient, reporter, company suspect drug, safety information, COI and decision logic.",
    "Screening",
    [
      "Patient and reporter identifiers follow approved literature validity rules.",
      "AE and special-situation logic is correctly represented.",
      "Screening decision is explainable and manual-review flags are visible.",
    ],
  ),
  manual(
    "UAT-PV-005",
    "Translation integrity",
    "Confirm original article language is preserved and AI translation is used only as working text.",
    "Translation",
    [
      "Original text remains unchanged and available.",
      "Translated text is clearly marked as a working translation.",
    ],
  ),
  manual(
    "UAT-PV-006",
    "Governed intake input generation",
    "Confirm the Literature module terminates at a complete, governed intake_input.json artifact.",
    "Output",
    [
      "intake_input.json contains the approved Literature output fields.",
      "No Intake workspace, case processing, QC or submission function is introduced.",
      "Output can be traced back to Evidence, Hits and Screening decisions.",
    ],
  ),
  manual(
    "UAT-PV-007",
    "Audit and explainability",
    "Confirm each material AI and human action is represented in the audit timeline.",
    "Audit",
    [
      "Request, package, tenant, actor and timestamp context are retained.",
      "Overrides and final decisions include reasons and evidence references.",
    ],
  ),
  manual(
    "UAT-PV-008",
    "Tenant and sensitive-data protection",
    "Confirm tenant isolation, access control and secure logging with representative PII.",
    "Security",
    [
      "A tenant cannot access another tenant's package or evidence.",
      "Tokens, email addresses and sensitive payloads are redacted from logs.",
      "Blocked access is recorded as a security event.",
    ],
  ),
];

function automated(
  id: string,
  title: string,
  description: string,
  category: string,
  endpoint: string,
): UatScenario {
  return {
    id,
    title,
    description,
    category,
    mode: "automated",
    mandatory: true,
    endpoint,
    method: "GET",
    expectedStatuses: [200],
    acceptanceCriteria: [`${endpoint} returns HTTP 200 within the configured timeout.`],
    evidenceRequired: ["HTTP status", "latency", "response sample", "build manifest hash"],
  };
}

function manual(
  id: string,
  title: string,
  description: string,
  category: string,
  acceptanceCriteria: string[],
): UatScenario {
  return {
    id,
    title,
    description,
    category,
    mode: "manual",
    mandatory: true,
    acceptanceCriteria,
    evidenceRequired: ["Tester", "execution date", "outcome", "notes or evidence reference"],
  };
}
