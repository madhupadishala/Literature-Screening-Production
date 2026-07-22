import type {
  ScreeningRequest,
  ScreeningResponse,
} from "@/lib/literature/screening/screening-types";
import { buildTenantRuntimeConfigurationContext } from "@/lib/configuration/runtime-context";
import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGMergedContext } from "@/lib/rag/rag-types";

import { recordAIAudit } from "./ai-audit";
import { recordAIMetric } from "./ai-metrics";
import { aiProviderFactory } from "./provider-factory";
import { createAIRequestId } from "./ai-runtime";
import { screeningPromptBuilder } from "./screening-prompt-builder";
import { parseScreeningAIResult } from "./screening-result-parser";
import { assessCompanySuspect } from "@/lib/pharmaceutical-intelligence/assessment-engine";
import type { CompanySuspectAssessment } from "@/lib/pharmaceutical-intelligence/types";

export interface ScreeningAgentResponse extends ScreeningResponse {
  ragContext: RAGMergedContext;
  configurationSnapshot: unknown;
  companySuspectAssessments: CompanySuspectAssessment[];
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
      const ragResponse = await ragEngine.buildContext({
        tenantId: request.tenantId,
        query: [
          "literature screening validity decision",
          request.article.title,
          request.article.abstract,
          request.article.country,
          "patient reporter suspect product adverse event special situation active MAH duplicate inclusion exclusion",
        ].filter(Boolean).join(" "),
        country: request.article.country,
        processArea: "literature_screening",
        searchMode: "hybrid",
        topK: 10,
        minScore: 0,
        correlationId: request.correlationId,
      });
      const runtimeConfiguration = await buildTenantRuntimeConfigurationContext(request.tenantId);
      const prompt = screeningPromptBuilder.build(request, {
        ragContext: ragResponse.context,
        runtimeConfiguration,
      });

      const completion = await provider.complete({
        systemPrompt:
          "You are a Pharmacovigilance Literature Screening expert. Return one valid JSON object only. Do not add markdown or commentary.",
        userPrompt: prompt,
        responseFormat: "json",
        requestId,
      });

      const parsed = parseScreeningAIResult(completion.content);
      const companySuspectAssessments = parsed.extractedSuspectEvidence.map((evidence) =>
        assessCompanySuspect({
          evidence,
          productMaster: runtimeConfiguration.productMaster,
        }),
      );
      const productReviewRequired = companySuspectAssessments.some(
        (assessment) => assessment.manualReviewRequired,
      );
      const governedDecision = productReviewRequired ? "REVIEW" : parsed.decision;

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

      await recordAIAudit({
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
        decision: governedDecision,
        confidence: parsed.confidence,
        metadata: {
          reason: parsed.reason,
          findingsCount: parsed.findings.length,
          knowledgeContextPackId: ragResponse.context.contextPackId,
          knowledgeCitationIds: ragResponse.context.citations?.map((citation) => citation.citationId) || [],
          configurationSnapshot: runtimeConfiguration.snapshot,
          pharmaceuticalKnowledgeVersion:
            companySuspectAssessments[0]?.knowledgeVersion || null,
          companySuspectAssessments,
        },
      });

      return {
        tenantId: request.tenantId,
        pmid: request.article.pmid,
        decision: governedDecision,
        confidence: parsed.confidence,
        reason: parsed.reason,
        findings: parsed.findings,
        screenedAt: new Date().toISOString(),
        workflowStage: "SCREENING_COMPLETED",
        ragContext: ragResponse.context,
        configurationSnapshot: runtimeConfiguration.snapshot,
        companySuspectAssessments,
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
      await recordAIAudit({
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
