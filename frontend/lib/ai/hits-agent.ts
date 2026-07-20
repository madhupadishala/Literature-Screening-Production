import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGMergedContext } from "@/lib/rag/rag-types";

import { recordAIAudit } from "./ai-audit";
import { recordAIMetric } from "./ai-metrics";
import { createAIRequestId } from "./ai-runtime";
import { buildHitsPrompt } from "./hits-prompt-builder";
import {
  parseHitsAIResult,
  type HitsAIResult,
} from "./hits-result-parser";
import { aiProviderFactory } from "./provider-factory";

export interface HitsAgentRequest {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  processArea?: string;
  correlationId?: string;
}

export interface HitsAgentResponse {
  tenantId: string;
  articleId?: string;
  prompt: string;
  ragContext: RAGMergedContext;
  result: HitsAIResult;
  generatedAt: string;
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

function buildRAGQuery(request: HitsAgentRequest): string {
  return [
    "literature hit identification",
    request.articleTitle,
    request.abstractText,
    request.productName,
    request.country,
    "adverse event special situation suspect product validity",
  ]
    .filter(Boolean)
    .join(" ");
}

export class HitsAgent {
  async evaluate(request: HitsAgentRequest): Promise<HitsAgentResponse> {
    if (!request.tenantId?.trim()) {
      throw new Error("tenantId is required.");
    }

    const requestId = createAIRequestId("hits");

    try {
      const ragResponse = await ragEngine.buildContext({
        tenantId: request.tenantId,
        query: buildRAGQuery(request),
        productName: request.productName,
        country: request.country,
        processArea: request.processArea ?? "literature_screening",
        searchMode: "hybrid",
        topK: 8,
        minScore: 0,
      });

      const prompt = buildHitsPrompt({
        tenantId: request.tenantId,
        articleId: request.articleId,
        articleTitle: request.articleTitle,
        abstractText: request.abstractText,
        fullTextSnippet: request.fullTextSnippet,
        productName: request.productName,
        country: request.country,
        ragContext: ragResponse.context,
      });

      const provider = aiProviderFactory.getProvider();
      const aiResponse = await provider.complete({
        systemPrompt:
          "You are the ClinixAI Literature Hits Agent. Return one valid JSON object only. Do not add markdown or commentary.",
        userPrompt: prompt,
        responseFormat: "json",
        requestId,
      });

      const result = parseHitsAIResult(aiResponse.content);

      recordAIMetric({
        operation: "hits",
        provider: aiResponse.provider,
        model: aiResponse.model,
        success: true,
        latencyMs: aiResponse.latencyMs,
        attempts: aiResponse.attempts,
        promptTokens: aiResponse.promptTokens,
        completionTokens: aiResponse.completionTokens,
        totalTokens: aiResponse.totalTokens,
        requestId: aiResponse.requestId,
        correlationId: request.correlationId,
      });

      recordAIAudit({
        operation: "hits",
        status: "SUCCESS",
        tenantId: request.tenantId,
        articleId: request.articleId,
        provider: aiResponse.provider,
        model: aiResponse.model,
        requestId: aiResponse.requestId,
        correlationId: request.correlationId,
        attempts: aiResponse.attempts,
        latencyMs: aiResponse.latencyMs,
        decision: result.classification,
        confidence: result.confidence,
        metadata: {
          recommendedNextStep: result.recommendedNextStep,
          qcRequired: result.qcRequired,
          duplicateSuspected: result.duplicateSuspected,
          retrievedKnowledgeChunks: ragResponse.context.chunks.length,
        },
      });

      return {
        tenantId: request.tenantId,
        articleId: request.articleId,
        prompt,
        ragContext: ragResponse.context,
        result,
        generatedAt: new Date().toISOString(),
        aiExecution: {
          provider: aiResponse.provider,
          model: aiResponse.model,
          requestId: aiResponse.requestId,
          correlationId: request.correlationId,
          attempts: aiResponse.attempts,
          latencyMs: aiResponse.latencyMs,
          promptTokens: aiResponse.promptTokens,
          completionTokens: aiResponse.completionTokens,
          totalTokens: aiResponse.totalTokens,
        },
      };
    } catch (error) {
      recordAIAudit({
        operation: "hits",
        status: "FAILED",
        tenantId: request.tenantId,
        articleId: request.articleId,
        requestId,
        correlationId: request.correlationId,
        errorMessage: error instanceof Error ? error.message : "Unknown Hits AI error.",
        metadata: {},
      });

      throw error;
    }
  }
}

export const hitsAgent = new HitsAgent();
