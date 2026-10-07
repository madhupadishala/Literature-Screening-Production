import { createHash, randomUUID } from "node:crypto";

export type PVAgentName = "drug-role" | "causality";
export interface SharedPVRequest {
  tenant_id: string; client_id: string; workspace_id: string; case_id: string;
  narrative: string; source_type: string; event_terms: string[]; request_id?: string;
}
export interface SharedPVResponse {
  schema_version: "nexus.pv-agent/1"; agent: PVAgentName;
  tenant_id: string; client_id: string; workspace_id: string; request_id: string; case_id: string;
  input_sha256: string; confidence: number; route: "hitl"; review_required: true;
  audit_id: string; knowledge_version: string; evidence_spans: unknown[]; result: Record<string, unknown>;
}
export async function assessSharedPVAgent(agent: PVAgentName, request: SharedPVRequest): Promise<SharedPVResponse> {
  const flag = agent === "drug-role" ? "NEXUS_DRUG_ROLE_ENABLED" : "NEXUS_CAUSALITY_ENABLED";
  if (process.env[flag] !== "true") throw new Error("Shared PV agent is disabled pending qualification");
  const url = process.env.NEXUS_PV_AGENT_URL; const token = process.env.NEXUS_PV_AGENT_TOKEN;
  if (!url || !token) throw new Error("Shared PV service configuration required");
  const payload = { ...request, request_id: request.request_id || randomUUID(), input_sha256: createHash("sha256").update(request.narrative, "utf8").digest("hex") };
  const response = await fetch(`${url.replace(/\/$/, "")}/v1/agents/${agent}/assess`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(`Shared PV service failed (${response.status})`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid shared PV response");
  const r = value as Record<string, unknown>;
  for (const k of ["tenant_id", "client_id", "workspace_id", "case_id", "request_id", "input_sha256"] as const) if (r[k] !== payload[k]) throw new Error("Shared PV response scope/hash mismatch");
  if (r.schema_version !== "nexus.pv-agent/1" || r.agent !== agent || r.route !== "hitl" || r.review_required !== true || typeof r.audit_id !== "string" || !r.audit_id || typeof r.knowledge_version !== "string" || !r.knowledge_version || !Array.isArray(r.evidence_spans) || typeof r.confidence !== "number" || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1 || !r.result || typeof r.result !== "object" || Array.isArray(r.result)) throw new Error("Invalid shared PV response contract");
  return r as unknown as SharedPVResponse;
}
