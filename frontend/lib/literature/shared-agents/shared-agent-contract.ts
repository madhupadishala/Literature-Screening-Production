/**
 * Canonical shared PV service contract for Literature. Pure functions: no Node/Next dependencies.
 * Specialist results are unqualified suggestions, never autonomous case decisions.
 */
export const PV_AGENT_SCHEMA = "nexus.pv-agent/1" as const;
export const PV_AGENT_NAMES = ["drug-role", "seriousness", "causality", "specialist-icsr"] as const;
export type SharedPVAgentName = (typeof PV_AGENT_NAMES)[number];
export type ScopedAgentRequest = {
  tenant_id: string; client_id: string; workspace_id: string;
  request_id: string; case_id: string; narrative: string;
  input_sha256: string; source_type?: string; event_terms?: string[];
};
export type SharedPVAgentSuggestion = {
  schema_version: typeof PV_AGENT_SCHEMA;
  agent: SharedPVAgentName;
  tenant_id: string; client_id: string; workspace_id: string;
  request_id: string; case_id: string; input_sha256: string;
  confidence: number; route: "hitl"; review_required: true;
  knowledge_version: string;
  evidence_spans: Array<{start:number;end:number;text:string}>;
  result: Record<string, unknown>; audit_id: string;
};
export function requireAgentRequest(value: ScopedAgentRequest): void {
  for (const key of ["tenant_id","client_id","workspace_id","request_id","case_id","narrative","input_sha256"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) throw new Error("Incomplete scoped agent request");
  }
  if (value.narrative.length > 50000 || !/^[a-f0-9]{64}$/.test(value.input_sha256)) {
    throw new Error("Invalid agent input length/hash");
  }
  if (value.event_terms && (value.event_terms.length > 50 || value.event_terms.some(t => !t || t.length > 200))) {
    throw new Error("Invalid agent event terms");
  }
}
function object(value:unknown): value is Record<string,unknown> {
  return !!value && typeof value==="object" && !Array.isArray(value);
}
export function validateAgentSuggestion(value:unknown, name:SharedPVAgentName, request:ScopedAgentRequest): SharedPVAgentSuggestion {
  if (!object(value) || value.schema_version!==PV_AGENT_SCHEMA || value.agent!==name ||
      value.route!=="hitl" || value.review_required!==true) throw new Error("Unqualified agent response");
  for (const key of ["tenant_id","client_id","workspace_id","request_id","case_id","input_sha256"] as const) {
    if (value[key]!==request[key]) throw new Error("Agent response scope/identity mismatch");
  }
  if (typeof value.audit_id!=="string" || !value.audit_id ||
      typeof value.knowledge_version!=="string" || !value.knowledge_version ||
      typeof value.confidence!=="number" || !Number.isFinite(value.confidence) ||
      value.confidence<0 || value.confidence>1 || !object(value.result) ||
      !Array.isArray(value.evidence_spans)) throw new Error("Invalid agent result provenance");
  for (const item of value.evidence_spans) {
    if (!object(item) || !Number.isInteger(item.start) || !Number.isInteger(item.end) ||
        (item.start as number)<0 || (item.end as number)<(item.start as number) ||
        (item.end as number)>request.narrative.length ||
        request.narrative.slice(item.start as number,item.end as number)!==item.text) {
      throw new Error("Ungrounded agent evidence");
    }
  }
  return value as SharedPVAgentSuggestion;
}
