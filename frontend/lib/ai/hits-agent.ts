import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGMergedContext } from "@/lib/rag/rag-types";
import { buildHitsPrompt } from "./hits-prompt-builder";
import {
  parseHitsAIResult,
  type HitsAIResult,
} from "./hits-result-parser";

export interface HitsAgentRequest {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  processArea?: string;
}

export interface HitsAgentResponse {
  tenantId: string;
  articleId?: string;
  prompt: string;
  ragContext: RAGMergedContext;
  result: HitsAIResult;
  generatedAt: string;
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

function mockLLMResponse(request: HitsAgentRequest): string {
  const searchableText = [
    request.articleTitle,
    request.abstractText,
    request.fullTextSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const productName = request.productName?.toLowerCase();

  const hasProduct =
    Boolean(productName) &&
    searchableText.includes(productName as string);

  const eventKeywords = [
    "adverse event",
    "reaction",
    "toxicity",
    "death",
    "life-threatening",
    "hospitalization",
    "pregnancy",
    "overdose",
    "medication error",
    "lack of efficacy",
  ];

  const detectedEvents = eventKeywords.filter((keyword) =>
    searchableText.includes(keyword),
  );

  const isHit = hasProduct && detectedEvents.length > 0;

  return JSON.stringify({
    isHit,
    confidence: isHit ? 0.82 : 0.38,
    classification: isHit ? "hit" : "needs_manual_review",
    reasons: isHit
      ? [
          "Company product was detected in the article text.",
          "Potential adverse event or special situation signal was detected.",
        ]
      : [
          "Insufficient automated evidence for a confirmed hit.",
          "Manual review is recommended before rejection.",
        ],
    detectedProducts: hasProduct && request.productName ? [request.productName] : [],
    detectedEvents,
    detectedSpecialSituations: detectedEvents.filter((event) =>
      ["pregnancy", "overdose", "medication error", "lack of efficacy"].includes(
        event,
      ),
    ),
    recommendedNextStep: isHit ? "send_to_screening" : "manual_review",
  });
}

export class HitsAgent {
  async evaluate(request: HitsAgentRequest): Promise<HitsAgentResponse> {
    if (!request.tenantId) {
      throw new Error("tenantId is required.");
    }

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
      articleTitle: request.articleTitle,
      abstractText: request.abstractText,
      fullTextSnippet: request.fullTextSnippet,
      productName: request.productName,
      country: request.country,
      ragContext: ragResponse.context,
    });

    const rawAIResponse = mockLLMResponse(request);
    const result = parseHitsAIResult(rawAIResponse);

    return {
      tenantId: request.tenantId,
      articleId: request.articleId,
      prompt,
      ragContext: ragResponse.context,
      result,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const hitsAgent = new HitsAgent();