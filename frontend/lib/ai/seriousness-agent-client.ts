export type SeriousnessCriterion =
  | "death"
  | "life_threatening"
  | "hospitalization"
  | "disability"
  | "congenital_anomaly"
  | "medically_important";

export interface SeriousnessAssessmentRequest {
  case_id: string;
  narrative: string;
  event_terms: string[];
  client_id: string;
  jurisdiction?: string;
  effective_on?: string;
  request_id?: string;
}

export interface SeriousnessAssessmentResponse {
  case_id: string;
  execution_id: string;
  decision: "serious" | "non_serious" | "needs_review";
  route: "auto" | "hitl";
  criteria_met: SeriousnessCriterion[];
  review_reasons: string[];
  explanation: string;
  input_sha256: string;
  audit_id?: number | null;
}

export interface SeriousnessAgentCallContext {
  bearerToken: string;
}

export function seriousnessAgentEnabled(): boolean {
  return process.env.NEXUS_SERIOUSNESS_ENABLED === "true";
}

export async function assessSeriousness(
  request: SeriousnessAssessmentRequest,
  context: SeriousnessAgentCallContext,
): Promise<SeriousnessAssessmentResponse> {
  if (!seriousnessAgentEnabled()) {
    throw new Error("Nexus Seriousness Agent is feature-flagged off");
  }

  const baseUrl = process.env.NEXUS_SERIOUSNESS_AGENT_URL;
  if (!baseUrl) {
    throw new Error("NEXUS_SERIOUSNESS_AGENT_URL is not configured");
  }
  if (!context.bearerToken) {
    throw new Error("Server-issued Nexus service token is required");
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/v1/agents/seriousness/assess`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${context.bearerToken}`,
        "x-request-id": request.request_id ?? crypto.randomUUID(),
      },
      body: JSON.stringify(request),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Seriousness Agent request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const result = (await response.json()) as SeriousnessAssessmentResponse;
  if (result.decision === "needs_review") {
    // Never coerce uncertainty into a non-serious conclusion.
    return result;
  }
  return result;
}
