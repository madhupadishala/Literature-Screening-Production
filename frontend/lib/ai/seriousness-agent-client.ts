import { createHash, randomUUID } from "node:crypto";

export type SeriousnessCriterion = "death" | "life_threatening" | "hospitalization" | "disability" | "congenital_anomaly" | "medically_important";
export interface SeriousnessAssessmentRequest {
  tenant_id: string;
  client_id: string;
  workspace_id: string;
  case_id: string;
  narrative: string;
  event_terms: string[];
  jurisdiction?: string;
  effective_on?: string;
  request_id?: string;
}
export interface SeriousnessAssessmentResponse {
  tenant_id: string;
  client_id: string;
  workspace_id: string;
  request_id: string;
  case_id: string;
  execution_id: string;
  decision: "serious" | "non_serious" | "needs_review";
  route: "auto" | "hitl";
  criteria_met: SeriousnessCriterion[];
  review_reasons: string[];
  explanation: string;
  input_sha256: string;
  confidence: number;
  knowledge_version: string;
  evidence_spans: Array<{ text: string; start: number; end: number }>;
  audit_id: number | string;
}
export interface SeriousnessAgentCallContext { bearerToken: string }
const criteria = ["death", "life_threatening", "hospitalization", "disability", "congenital_anomaly", "medically_important"];
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(x => typeof x === "string"); }
export function validateSeriousnessResponse(value: unknown, expected: { tenant_id: string; client_id: string; workspace_id: string; request_id: string; case_id: string; input_sha256: string; narrative?: string }): SeriousnessAssessmentResponse {
  if (!record(value)) throw new Error("Invalid seriousness response");
  for (const key of ["tenant_id", "client_id", "workspace_id", "request_id", "case_id", "input_sha256"] as const) {
    if (value[key] !== expected[key]) throw new Error(`Seriousness response correlation mismatch: ${key}`);
  }
  if (!/^[a-f0-9]{64}$/.test(String(value.input_sha256)) ||
      !["serious", "non_serious", "needs_review"].includes(String(value.decision)) ||
      !["auto", "hitl"].includes(String(value.route)) ||
      !strings(value.criteria_met) || !value.criteria_met.every(x => criteria.includes(x)) ||
      !strings(value.review_reasons) || typeof value.explanation !== "string" ||
      typeof value.execution_id !== "string" || !value.execution_id ||
      typeof value.knowledge_version !== "string" || !value.knowledge_version ||
      typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 ||
      !((typeof value.audit_id === "number" && Number.isInteger(value.audit_id) && value.audit_id > 0) || (typeof value.audit_id === "string" && value.audit_id.length > 0))) {
    throw new Error("Invalid seriousness response schema");
  }
  if (!Array.isArray(value.evidence_spans) || value.evidence_spans.some(span => !record(span) || typeof span.text !== "string" || !Number.isInteger(span.start) || !Number.isInteger(span.end) || Number(span.start) < 0 || Number(span.end) < Number(span.start) || (expected.narrative !== undefined && (Number(span.end) > Array.from(expected.narrative).length || Array.from(expected.narrative).slice(Number(span.start), Number(span.end)).join("") !== span.text)))) throw new Error("Invalid seriousness evidence spans");
  if (value.decision === "serious" && value.evidence_spans.length === 0) throw new Error("Serious conclusion requires source evidence");
  if ((value.decision === "needs_review" && value.route !== "hitl") ||
      (value.route === "auto" && value.review_reasons.length > 0) ||
      (value.decision === "non_serious" && value.criteria_met.length > 0) ||
      (value.decision === "serious" && value.criteria_met.length === 0)) {
    throw new Error("Contradictory seriousness response");
  }
  return value as unknown as SeriousnessAssessmentResponse;
}
export function seriousnessAgentEnabled(): boolean { return process.env.NEXUS_SERIOUSNESS_ENABLED === "true"; }
export async function assessSeriousness(request: SeriousnessAssessmentRequest, context: SeriousnessAgentCallContext): Promise<SeriousnessAssessmentResponse> {
  if (!seriousnessAgentEnabled()) throw new Error("Nexus Seriousness Agent is feature-flagged off");
  const baseUrl = process.env.NEXUS_SERIOUSNESS_AGENT_URL;
  if (!baseUrl || !context.bearerToken) throw new Error("Seriousness service configuration is required");
  if (!request.tenant_id || !request.client_id || !request.workspace_id || !request.case_id || !request.narrative?.trim() || !strings(request.event_terms)) throw new Error("Invalid seriousness request");
  const payload = { ...request, request_id: request.request_id || randomUUID() };
  // Shared boundary: input hash is SHA-256 of exact UTF-8 narrative bytes.
  const serialized = JSON.stringify(payload);
  const hash = createHash("sha256").update(request.narrative, "utf8").digest("hex");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/agents/seriousness/assess`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${context.bearerToken}`, "x-request-id": payload.request_id, "x-input-sha256": hash },
    body: serialized, cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`Seriousness Agent request failed (${response.status})`);
  return validateSeriousnessResponse(await response.json(), { ...payload, input_sha256: hash });
}
