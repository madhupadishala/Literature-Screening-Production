import type {
  ScreeningDecision,
  ScreeningFinding,
  ScreeningReason,
} from "@/lib/literature/screening/screening-types";

export interface ParsedScreeningAIResult {
  decision: ScreeningDecision;
  confidence: number;
  reason: ScreeningReason;
  findings: ScreeningFinding[];
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
  };
}
