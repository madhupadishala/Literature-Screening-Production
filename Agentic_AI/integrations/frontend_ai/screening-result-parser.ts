import type {
  EventSeriousness,
  EventSeverity,
  LiteraturePublicationClassification,
  ScreeningClinicalEvent,
  ScreeningDecision,
  ScreeningFinding,
  ScreeningReason,
  ScreeningRegulatoryEvidence,
  SeriousnessCriterion,
} from "@/lib/literature/screening/screening-types";
import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";
import type { SafetyEvidenceExtraction } from "@/lib/pv-decision-intelligence/types";
import { normalizeSafetyEvidence, normalizeSuspectEvidence } from "./hits-result-parser";

export interface ParsedScreeningAIResult {
  decision: ScreeningDecision;
  confidence: number;
  reason: ScreeningReason;
  findings: ScreeningFinding[];
  safetyEvidence: SafetyEvidenceExtraction;
  regulatoryEvidence: ScreeningRegulatoryEvidence;
  extractedSuspectEvidence: SuspectProductEvidence[];
}

const ALLOWED_DECISIONS: ScreeningDecision[] = ["INCLUDE", "EXCLUDE", "REVIEW"];
const ALLOWED_REASONS: ScreeningReason[] = [
  "CASE_REPORT",
  "ADVERSE_EVENT",
  "PRODUCT_MENTION",
  "HUMAN_STUDY",
  "ANIMAL_STUDY",
  "REVIEW_ARTICLE",
  "NO_ADVERSE_EVENT",
  "NON_MEDICAL",
  "INSUFFICIENT_INFORMATION",
  "NON_ENGLISH",
  "DUPLICATE",
  "UNKNOWN",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function normalizeFindings(value: unknown): ScreeningFinding[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((finding) => ({
    rule:
      typeof finding.rule === "string" && finding.rule.trim()
        ? finding.rule.trim()
        : "Unknown Rule",
    passed: Boolean(finding.passed),
    score:
      typeof finding.score === "number" && Number.isFinite(finding.score)
        ? Math.max(0, Math.min(100, finding.score))
        : 0,
    comment: typeof finding.comment === "string" ? finding.comment.trim() : "",
  }));
}


const PUBLICATION_TYPES: LiteraturePublicationClassification[] = [
  "CASE_REPORT","CASE_SERIES","CLINICAL_TRIAL","OBSERVATIONAL_STUDY",
  "REVIEW_ARTICLE","META_ANALYSIS","CONFERENCE_ABSTRACT","EDITORIAL",
  "LETTER","ANIMAL_STUDY","IN_VITRO_STUDY","REGISTRY_STUDY",
  "DATABASE_ANALYSIS","OTHER","UNRESOLVED",
];

const SERIOUSNESS_VALUES: EventSeriousness[] = ["SERIOUS","NON_SERIOUS","UNRESOLVED"];
const SEVERITY_VALUES: EventSeverity[] = ["MILD","MODERATE","SEVERE","UNRESOLVED"];
const SERIOUSNESS_CRITERIA: SeriousnessCriterion[] = [
  "DEATH","LIFE_THREATENING","HOSPITALIZATION","DISABILITY",
  "CONGENITAL_ANOMALY","OTHER_MEDICALLY_IMPORTANT","NONE_IDENTIFIED",
];

function normalizeClinicalEvents(value: unknown): ScreeningClinicalEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((event) => {
    const eventName =
      typeof event.event === "string" ? event.event.trim() : "";
    if (!eventName) return [];
    const severity = SEVERITY_VALUES.includes(event.severity as EventSeverity)
      ? (event.severity as EventSeverity)
      : "UNRESOLVED";
    const seriousness = SERIOUSNESS_VALUES.includes(event.seriousness as EventSeriousness)
      ? (event.seriousness as EventSeriousness)
      : "UNRESOLVED";
    const seriousnessCriteria = Array.isArray(event.seriousnessCriteria)
      ? event.seriousnessCriteria.filter(
          (item): item is SeriousnessCriterion =>
            SERIOUSNESS_CRITERIA.includes(item as SeriousnessCriterion),
        )
      : [];
    return [{
      event: eventName,
      evidence: typeof event.evidence === "string" && event.evidence.trim()
        ? event.evidence.trim()
        : undefined,
      severity,
      seriousness,
      seriousnessCriteria,
    }];
  });
}

function normalizeRegulatoryEvidence(value: unknown): ScreeningRegulatoryEvidence {
  const record = isRecord(value) ? value : {};
  const publicationClassification = PUBLICATION_TYPES.includes(
    record.publicationClassification as LiteraturePublicationClassification,
  )
    ? (record.publicationClassification as LiteraturePublicationClassification)
    : "UNRESOLVED";
  const status = (candidate: unknown) =>
    ["PRESENT","ABSENT","UNRESOLVED","CONFLICTING"].includes(String(candidate))
      ? (candidate as SafetyEvidenceExtraction["patientIdentifiable"])
      : "UNRESOLVED";

  const countryOfIncidence =
    typeof record.countryOfIncidence === "string" && record.countryOfIncidence.trim()
      ? record.countryOfIncidence.trim()
      : undefined;
  const rawCountryStatus = status(record.countryOfIncidenceStatus);
  const countryOfIncidenceStatus =
    rawCountryStatus === "ABSENT" && !countryOfIncidence
      ? "UNRESOLVED"
      : rawCountryStatus;

  return {
    publicationClassification,
    publicationClassificationEvidence:
      typeof record.publicationClassificationEvidence === "string" &&
      record.publicationClassificationEvidence.trim()
        ? record.publicationClassificationEvidence.trim()
        : undefined,
    clinicalEvents: normalizeClinicalEvents(record.clinicalEvents),
    patientPiiStatus: status(record.patientPiiStatus),
    patientPiiEvidence:
      typeof record.patientPiiEvidence === "string" && record.patientPiiEvidence.trim()
        ? record.patientPiiEvidence.trim()
        : undefined,
    countryOfIncidenceStatus,
    countryOfIncidence,
    countryOfIncidenceEvidence:
      typeof record.countryOfIncidenceEvidence === "string" &&
      record.countryOfIncidenceEvidence.trim()
        ? record.countryOfIncidenceEvidence.trim()
        : undefined,
  };
}

export function parseScreeningAIResult(raw: string): ParsedScreeningAIResult {
  const parsed: unknown = JSON.parse(extractJson(raw));
  if (!isRecord(parsed)) {
    throw new Error("Screening AI response must be a JSON object.");
  }

  const decision = ALLOWED_DECISIONS.includes(parsed.decision as ScreeningDecision)
    ? (parsed.decision as ScreeningDecision)
    : "REVIEW";
  const reason = ALLOWED_REASONS.includes(parsed.reason as ScreeningReason)
    ? (parsed.reason as ScreeningReason)
    : "UNKNOWN";

  return {
    decision,
    confidence: normalizeConfidence(parsed.confidence),
    reason,
    findings: normalizeFindings(parsed.findings),
    safetyEvidence: normalizeSafetyEvidence(parsed.safetyEvidence),
    regulatoryEvidence: normalizeRegulatoryEvidence(parsed.regulatoryEvidence),
    extractedSuspectEvidence: normalizeSuspectEvidence(parsed.extractedSuspectEvidence),
  };
}
