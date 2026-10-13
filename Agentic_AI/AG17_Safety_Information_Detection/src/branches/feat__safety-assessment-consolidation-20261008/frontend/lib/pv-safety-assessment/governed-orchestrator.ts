import { createHash } from "node:crypto";
import { assessPvSafety } from "./assessment-engine";
import type { PvSafetyAssessmentInput } from "./types";

/** Clinical decision-support only. No silent autonomous case disposition. */
export const SAFETY_AGENT_NAMES = ["drug", "adverse_event", "country_of_incident", "seriousness", "listedness", "causality"] as const;
export type SafetyAgentName = typeof SAFETY_AGENT_NAMES[number];
export interface SafetySource {
  id: string;
  sha256: string;
  text: string;
}
export interface AgentEvidence {
  sourceId: string;
  start: number;
  end: number;
  quote: string;
}
export interface SpecialistDecision {
  agent: SafetyAgentName;
  tenantId: string;
  clientId: string;
  status: "SUPPORTED" | "UNRESOLVED" | "CONFLICTING" | "FAILED";
  knowledgeId: string;
  knowledgeVersion: string;
  evidence: AgentEvidence[];
  payload: unknown;
}
export interface GovernedSafetyRequest {
  tenantId: string;
  clientId: string;
  caseId: string;
  sources: SafetySource[];
  screeningInput: PvSafetyAssessmentInput;
  decisions: SpecialistDecision[];
  knowledge: { tenantId: string; clientId: string; id: string; version: string; status: "APPROVED" | "DRAFT" };
}
function nonEmpty(value: string): boolean { return typeof value === "string" && value.trim().length > 0; }
function validEvidence(e: AgentEvidence, sources: SafetySource[]): boolean {
  const source = sources.find(s => s.id === e.sourceId);
  return Boolean(source && Number.isInteger(e.start) && Number.isInteger(e.end) &&
    e.start >= 0 && e.end > e.start && e.end <= source!.text.length &&
    source!.text.slice(e.start, e.end) === e.quote && e.quote.trim());
}
export function assessGovernedSafety(request: GovernedSafetyRequest) {
  if (![request.tenantId, request.clientId, request.caseId].every(nonEmpty)) throw new Error("Scope and case are mandatory");
  if (request.knowledge.tenantId !== request.tenantId || request.knowledge.clientId !== request.clientId)
    throw new Error("Knowledge scope mismatch");
  if (!nonEmpty(request.knowledge.id) || !nonEmpty(request.knowledge.version)) throw new Error("Versioned knowledge required");
  const ids = new Set<string>();
  for (const s of request.sources) {
    if (!nonEmpty(s.id) || ids.has(s.id) || !/^[0-9a-f]{64}$/i.test(s.sha256) ||
      createHash("sha256").update(s.text).digest("hex") !== s.sha256) throw new Error("Unverified source provenance");
    ids.add(s.id);
  }
  const issues: string[] = [];
  const decisions = SAFETY_AGENT_NAMES.map(agent => {
    const matches = request.decisions.filter(d => d.agent === agent);
    if (matches.length !== 1) {
      issues.push(agent + ":MISSING_OR_DUPLICATE");
      return {agent, status: "UNRESOLVED" as const, evidence: [] as AgentEvidence[]};
    }
    const d = matches[0];
    if (d.tenantId !== request.tenantId || d.clientId !== request.clientId)
      throw new Error(agent + ":CROSS_TENANT_DECISION");
    if (d.knowledgeId !== request.knowledge.id || d.knowledgeVersion !== request.knowledge.version)
      issues.push(agent + ":KNOWLEDGE_VERSION_MISMATCH");
    if (d.evidence.length === 0 || !d.evidence.every(e => validEvidence(e, request.sources)))
      issues.push(agent + ":MISSING_OR_INVALID_EVIDENCE");
    if (d.status !== "SUPPORTED") issues.push(agent + ":" + d.status);
    return {agent, status:d.status, evidence:d.evidence};
  });
  const assessment = assessPvSafety(request.screeningInput);
  if (request.knowledge.status !== "APPROVED") issues.push("KNOWLEDGE_NOT_APPROVED");
  if (assessment.manualReviewRequired) issues.push("ASSESSMENT_REVIEW_REQUIRED");
  if (assessment.safetyRelevance === "UNRESOLVED") issues.push("SAFETY_RELEVANCE_UNRESOLVED");
  // Specialist results are NOT trusted as source facts or silently mapped into the
  // screening input. Integration adapters must construct source-grounded input first.
  const audit = {
    caseId:request.caseId, tenantId:request.tenantId, clientId:request.clientId,
    knowledgeId:request.knowledge.id, knowledgeVersion:request.knowledge.version,
    sourceHashes:request.sources.map(s=>({id:s.id,sha256:s.sha256})),
    decisionStatuses:decisions.map(d=>({agent:d.agent,status:d.status})),
    assessment:assessment.safetyRelevance, issues,
  };
  return {
    assessment, decisions, issues,
    disposition:"MEDICAL_REVIEW_REQUIRED" as const,
    autonomousReleaseAllowed:false as const,
    audit,
    auditDigest:createHash("sha256").update(JSON.stringify(audit)).digest("hex"),
  };
}
