export const ICSR_PREFLIGHT_ENGINE_VERSION = "nexus-icsr-preflight-1.0.0";

export type PreflightFinding = {
  findingId: string;
  severity: "critical" | "high" | "medium";
  category: string;
  message: string;
  evidence: string[];
  recommendedAction: string;
  requiresHumanReview: true;
};

const serious = /\b(serious|life[- ]threatening|hospitali[sz](?:ed|ation)|fatal|died|death|disability|congenital anomaly)\b/i;
const nonSerious = /\b(non[- ]serious|not serious|no serious criteria)\b/i;
const fatal = /\b(fatal|died|death|deceased)\b/i;
const child = /\b(child|infant|toddler|newborn|teenager|minor)\b/i;
const elderly = /\b(elderly|older adult|geriatric)\b/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function finding(findingId: string, severity: PreflightFinding["severity"], category: string,
  message: string, evidence: string[], recommendedAction: string): PreflightFinding {
  return { findingId, severity, category, message, evidence, recommendedAction, requiresHumanReview: true };
}

/** Ports the starter's deterministic checks onto a frozen NEXUS canonical-case snapshot. */
export function runIcsrPreflight(casePayload: Record<string, unknown>, destinationProfile: string) {
  const patient = record(casePayload.patient);
  const events = records(casePayload.events ?? casePayload.reactions);
  const products = records(casePayload.products);
  const reporters = records(casePayload.reporters);
  const narrative = String(record(casePayload.narrative).text ?? casePayload.eventVerbatim ?? "");
  const age = Number(patient.ageYears ?? patient.age ?? Number.NaN);
  const findings: PreflightFinding[] = [];

  if (Number.isFinite(age) && age >= 18 && child.test(narrative)) findings.push(finding(
    "ICSR-CONS-AGE-005", "high", "cross_field_contradiction",
    "Narrative describes a child/minor but structured age is 18 or older.",
    [`patient.age=${age}`], "Verify patient age and narrative against source evidence."));
  if (Number.isFinite(age) && age < 65 && elderly.test(narrative)) findings.push(finding(
    "ICSR-CONS-AGE-002", age < 50 ? "high" : "medium", "cross_field_contradiction",
    "Narrative describes an older adult but structured age is below 65.",
    [`patient.age=${age}`], "Confirm the demographic data from the source; do not auto-correct."));

  const seriousness = events.flatMap((event) => Array.isArray(event.seriousnessCriteria) ? event.seriousnessCriteria : []);
  if (seriousness.length && nonSerious.test(narrative)) findings.push(finding(
    "ICSR-CONS-SER-001", "high", "medical_assessment_conflict",
    "Structured seriousness criteria conflict with non-serious narrative language.",
    [`seriousnessCriteria=${seriousness.join(",")}`], "Route to qualified medical review."));
  if (!seriousness.length && serious.test(narrative) && !nonSerious.test(narrative)) findings.push(finding(
    "ICSR-CONS-SER-002", "high", "medical_assessment_conflict",
    "Narrative contains serious-event language but no structured seriousness criterion is selected.",
    ["serious narrative signal"], "Assess seriousness and document the source-supported rationale."));

  const fatalOutcome = events.some((event) => String(event.outcome ?? "").toLowerCase() === "fatal");
  if (fatal.test(narrative) && !fatalOutcome) findings.push(finding(
    "ICSR-CONS-OUT-002", "high", "cross_field_contradiction",
    "Narrative mentions death/fatality but no event outcome is coded fatal.",
    ["fatal narrative signal"], "Review source and outcome coding urgently."));
  if (!events.length) findings.push(finding("ICSR-COMP-REA-001", "critical", "completeness",
    "No reaction/event is present in the canonical case.", ["events=[]"], "Capture a reportable event before proceeding."));
  if (!products.some((product) => /suspect/i.test(String(product.role ?? product.productRole ?? "")))) findings.push(finding(
    "ICSR-COMP-PROD-001", "high", "completeness", "No suspect product is recorded.",
    [`productCount=${products.length}`], "Verify product role using controlled source evidence."));
  if (!reporters.length) findings.push(finding("ICSR-COMP-REP-001", "medium", "completeness",
    "No reporter is present in the canonical case.", ["reporters=[]"], "Confirm reporter information or document legitimate unknown values."));

  const blockers = findings.filter((item) => item.severity === "critical" || item.severity === "high");
  return {
    engineVersion: ICSR_PREFLIGHT_ENGINE_VERSION,
    destinationProfile: destinationProfile.trim().toUpperCase() || "GENERIC_E2B_R3",
    profileStatus: "controlled_preflight_not_authority_certified",
    readiness: blockers.length ? "BLOCKED" : findings.length ? "REVIEW_REQUIRED" : "READY_FOR_APPROVAL",
    submissionBlocked: blockers.length > 0,
    humanReviewRequired: findings.length > 0,
    findings,
    limitations: ["Deterministic consistency checks do not replace medical review or authority conformance validation."],
  };
}
