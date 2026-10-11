import { createHash, randomUUID } from "node:crypto";

export const SHARED_AGENT_SCHEMA = "nexus.pv-agent/1" as const;
export type SharedAgentKey = "drug-role" | "seriousness" | "causality" | "specialist-icsr";

export const SHARED_AGENT_REGISTRY: Readonly<Record<SharedAgentKey, { mode: "suggestion-only"; requiresHumanReview: true }>> = Object.freeze({
  "drug-role": { mode: "suggestion-only", requiresHumanReview: true },
  seriousness: { mode: "suggestion-only", requiresHumanReview: true },
  causality: { mode: "suggestion-only", requiresHumanReview: true },
  "specialist-icsr": { mode: "suggestion-only", requiresHumanReview: true },
});

export interface SharedAgentInput {
  agent: SharedAgentKey;
  tenantId: string;
  clientId: string;
  workspaceId: string;
  caseId: string;
  narrative: string;
  sourceType?: string;
  eventTerms?: string[];
  requestId?: string;
}

export interface SharedAgentSuggestion {
  schema_version: typeof SHARED_AGENT_SCHEMA;
  agent: SharedAgentKey;
  tenant_id: string;
  client_id: string;
  workspace_id: string;
  request_id: string;
  case_id: string;
  input_sha256: string;
  confidence: number;
  route: "hitl";
  review_required: true;
  knowledge_version: string;
  evidence_spans: Array<{start:number;end:number;text:string}>;
  result: Record<string, unknown>;
}

export class SharedAgentUnavailable extends Error {
  constructor() { super("Shared clinical agent unavailable; manual review required."); }
}

export async function requestSharedAgentSuggestion(
  input: SharedAgentInput,
  options: { endpoint?: string; token?: string; enabled?: boolean; fetcher?: typeof fetch } = {},
): Promise<SharedAgentSuggestion> {
  if (options.enabled !== true) throw new SharedAgentUnavailable();
  const endpoint = options.endpoint;
  const token = options.token;
  if (!endpoint || !token) throw new SharedAgentUnavailable();
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new SharedAgentUnavailable();
  const cleanPath = url.pathname.replace(/\/$/, "");
  if (cleanPath && cleanPath !== "/") throw new SharedAgentUnavailable();
  for (const key of ["tenantId", "clientId", "workspaceId", "caseId", "narrative"] as const) {
    if (!input[key]?.trim()) throw new SharedAgentUnavailable();
  }
  if (input.narrative.length > 50_000) throw new SharedAgentUnavailable();
  const requestId = input.requestId || randomUUID();
  const digest = createHash("sha256").update(input.narrative, "utf8").digest("hex");
  const request = {
    tenant_id: input.tenantId, client_id: input.clientId, workspace_id: input.workspaceId,
    case_id: input.caseId, request_id: requestId, narrative: input.narrative,
    source_type: input.sourceType || "literature", event_terms: input.eventTerms || [],
    input_sha256: digest,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await (options.fetcher || fetch)(new URL(`/v1/agents/${input.agent}/assess`, url), {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(request), signal: controller.signal, cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new SharedAgentUnavailable();
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new SharedAgentUnavailable();
    const obj = result as Record<string, unknown>;
    if (obj.schema_version !== SHARED_AGENT_SCHEMA || obj.agent !== input.agent ||
        obj.tenant_id !== input.tenantId || obj.client_id !== input.clientId ||
        obj.workspace_id !== input.workspaceId || obj.case_id !== input.caseId ||
        obj.request_id !== requestId || obj.input_sha256 !== digest ||
        obj.route !== "hitl" || obj.review_required !== true ||
        typeof obj.confidence !== "number" || !Number.isFinite(obj.confidence) ||
        obj.confidence < 0 || obj.confidence > 1 ||
        typeof obj.knowledge_version !== "string" || !obj.knowledge_version ||
        !Array.isArray(obj.evidence_spans) || !obj.result || typeof obj.result !== "object") {
      throw new SharedAgentUnavailable();
    }
    for (const span of obj.evidence_spans) {
      if (!span || !Number.isInteger(span.start) || !Number.isInteger(span.end) ||
          span.start < 0 || span.end < span.start || span.end > input.narrative.length ||
          input.narrative.slice(span.start, span.end) !== span.text) throw new SharedAgentUnavailable();
    }
    return obj as unknown as SharedAgentSuggestion;
  } catch {
    throw new SharedAgentUnavailable();
  } finally {
    clearTimeout(timeout);
  }
}
