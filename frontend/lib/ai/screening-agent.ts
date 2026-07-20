import type {
  ScreeningRequest,
  ScreeningResponse,
} from "@/lib/literature/screening/screening-types";

import { recordAIAudit } from "./ai-audit";
import { recordAIMetric } from "./ai-metrics";
import { aiProviderFactory } from "./provider-factory";
import { createAIRequestId } from "./ai-runtime";
import { screeningPromptBuilder } from "./screening-prompt-builder";
import { parseScreeningAIResult } from "./screening-result-parser";

export interface ScreeningAgentResponse extends ScreeningResponse {
  aiExecution: {
    provider: string;
    model: string;
    requestId: string;
    correlationId?: string;
    attempts: number;
    latencyMs: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export class ScreeningAgent {
  async screen(request: ScreeningRequest): Promise<ScreeningAgentResponse> {
    const requestId = createAIRequestId("screening");

    try {
      const provider = aiProviderFactory.getProvider();
      const prompt = screeningPromptBuilder.build(request);

      const completion = await provider.complete({
        systemPrompt:
          "You are a Pharmacovigilance Literature Screening expert. Return one valid JSON object only. Do not add markdown or commentary.",
        userPrompt: prompt,
        responseFormat: "json",
        requestId,
      });

      const parsed = parseScreeningAIResult(completion.content);

      recordAIMetric({
        operation: "screening",
        provider: completion.provider,
        model: completion.model,
        success: true,
        latencyMs: completion.latencyMs,
        attempts: completion.attempts,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        requestId: completion.requestId,
        correlationId: request.correlationId,
      });

      recordAIAudit({
        operation: "screening",
        status: "SUCCESS",
        tenantId: request.tenantId,
        pmid: request.article.pmid,
        provider: completion.provider,
        model: completion.model,
        requestId: completion.requestId,
        correlationId: request.correlationId,
        attempts: completion.attempts,
        latencyMs: completion.latencyMs,
        decision: parsed.decision,
        confidence: parsed.confidence,
        metadata: {
          reason: parsed.reason,
          findingsCount: parsed.findings.length,
        },
      });

      return {
        tenantId: request.tenantId,
        pmid: request.article.pmid,
        decision: parsed.decision,
        confidence: parsed.confidence,
        reason: parsed.reason,
        findings: parsed.findings,
        screenedAt: new Date().toISOString(),
        workflowStage: "SCREENING_COMPLETED",
        aiExecution: {
          provider: completion.provider,
          model: completion.model,
          requestId: completion.requestId,
          correlationId: request.correlationId,
          attempts: completion.attempts,
          latencyMs: completion.latencyMs,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
        },
      };
    } catch (error) {
      recordAIAudit({
        operation: "screening",
        status: "FAILED",
        tenantId: request.tenantId,
        pmid: request.article.pmid,
        requestId,
        correlationId: request.correlationId,
        errorMessage:
          error instanceof Error ? error.message : "Unknown Screening AI error.",
        metadata: {},
      });

      throw error;
    }
  }
}

export const screeningAgent = new ScreeningAgent();
