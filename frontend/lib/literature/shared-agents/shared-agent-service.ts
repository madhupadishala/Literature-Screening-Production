import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { RequestPrincipal } from "@/lib/rbac/request-principal";
import { requireSafetyWorkspaceScope } from "@/lib/safety/common/safety-workspace-scope";
import {
  PV_AGENT_NAMES, requireAgentRequest, validateAgentSuggestion,
  type SharedPVAgentName, type ScopedAgentRequest, type SharedPVAgentSuggestion,
} from "./shared-agent-contract";

const TIMEOUT_MS = 8000;
export class SharedAgentUnavailable extends Error {
  constructor() { super("Shared specialist assessment unavailable; human review required."); }
}
/**
 * Opt-in integration boundary. Nothing calls this from screening by default.
 * Never forwards user credentials; the PV service bearer token is server-side.
 */
export async function proposeSharedAgent(input: {
  principal: RequestPrincipal;
  agent: SharedPVAgentName;
  caseId: string;
  narrative: string;
  eventTerms?: string[];
  sourceType?: string;
}): Promise<SharedPVAgentSuggestion> {
  if (process.env.NEXUS_LITERATURE_SHARED_AGENTS_ENABLED !== "true" ||
      !PV_AGENT_NAMES.includes(input.agent)) throw new SharedAgentUnavailable();
  const scope = requireSafetyWorkspaceScope(input.principal);
  const base = process.env.NEXUS_PV_AGENT_SERVICE_URL;
  const token = process.env.NEXUS_PV_AGENT_SERVICE_TOKEN;
  if (!base || !token || !input.caseId?.trim()) throw new SharedAgentUnavailable();
  let endpoint: URL;
  try {
    endpoint = new URL(`/v1/agents/${input.agent}/assess`, base);
    // Only private HTTPS services; test environments can use an explicit loopback override.
    if (endpoint.protocol !== "https:" &&
      !(process.env.NODE_ENV === "test" && endpoint.hostname === "127.0.0.1")) {
      throw new Error("Insecure service origin");
    }
    if (endpoint.username || endpoint.password || !endpoint.hostname) throw new Error("Invalid origin");
  } catch { throw new SharedAgentUnavailable(); }
  const request: ScopedAgentRequest = {
    tenant_id: input.principal.tenantId,
    client_id: scope.workspaceId,
    workspace_id: scope.workspaceId,
    case_id: input.caseId.trim(),
    request_id: randomUUID(),
    narrative: input.narrative,
    input_sha256: createHash("sha256").update(input.narrative,"utf8").digest("hex"),
    source_type: input.sourceType,
    event_terms: input.eventTerms,
  };
  try {
    requireAgentRequest(request);
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Specialist service request failed");
    const body: unknown = await response.json();
    return validateAgentSuggestion(body, input.agent, request);
  } catch {
    // Do not leak service errors, tokens or raw clinical source into HTTP responses/logs.
    throw new SharedAgentUnavailable();
  }
}
