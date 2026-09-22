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
    "UAT-NEXUS-001",
    "Nexus module entitlement and dependency enforcement",
    "Verify environment-scoped module licensing, fail-closed access, and the Case Processing dependency on Intake.",
    "Nexus Authorization",
    [
      "A UAT tenant with Literature, Intake and Case Processing enabled can access the licensed Nexus modules.",
      "A UAT tenant with Intake and Case Processing disabled is denied direct UI and API access to those modules.",
      "Case Processing is not effectively enabled when its Intake dependency is unavailable.",
    ],
  ),
  manual(
    "UAT-NEXUS-002",
    "Canonical Intake and source-review flow",
    "Exercise manual, document and governed Literature Intake paths through source review and human-confirmed extraction.",
    "Nexus Intake",
    [
      "All supported source channels converge on one tenant-scoped Intake record and preserve immutable source lineage.",
      "Extraction suggestions remain assistive until a human accepts, edits or rejects them.",
      "Every material human extraction decision is auditable with evidence and rationale.",
    ],
  ),
  manual(
    "UAT-NEXUS-003",
    "ICSR validity and triage",
    "Validate the four minimum ICSR criteria, due-diligence follow-up, seriousness, special situations and triage routing.",
    "Nexus Triage",
    [
      "Valid and unresolved/invalid scenarios produce the expected governed triage outcome.",
      "Missing minimum criteria route to explicit follow-up rather than silent discard.",
      "Finalised valid triage proceeds to duplicate/follow-up review and does not create a case prematurely.",
    ],
  ),
  manual(
    "UAT-NEXUS-004",
    "Duplicate, follow-up and disposition controls",
    "Verify explainable candidate matching and human-controlled duplicate/follow-up/disposition decisions.",
    "Nexus Disposition",
    [
      "Duplicate scoring is advisory and cannot make the final regulated relationship decision automatically.",
      "Confirmed duplicates cannot create a new Nexus case.",
      "Follow-up information routes to the existing case; a valid new case may create a Nexus case only when Case Processing is entitled.",
    ],
  ),
  manual(
    "UAT-NEXUS-005",
    "Case processing, QC, Medical Review and finalization",
    "Run an end-to-end synthetic case through versioned processing, QC, Medical Review and immutable finalization.",
    "Nexus Case Processing",
    [
      "Material edits create new draft/narrative/assessment versions without rewriting prior regulated history.",
      "QC and Medical Review approvals are bound to the reviewed draft revision and open queries block finalization.",
      "Successful finalization creates an immutable case version and the operational case reaches FINAL only atomically.",
    ],
  ),
  manual(
    "UAT-NEXUS-006",
    "Evidence package and controlled export",
    "Verify the finalized-case evidence chain and controlled Nexus/E2B mapping exports.",
    "Nexus Evidence",
    [
      "The evidence package contains source-to-final-decision lineage and cryptographic hashes without embedding raw uploaded bytes.",
      "Generated exports are append-only, versioned and hash-locked.",
      "E2B(R3) mapping output is clearly identified as mapping data and not represented as validated gateway transmission.",
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
