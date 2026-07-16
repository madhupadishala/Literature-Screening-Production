import type { RAGMergedContext } from "@/lib/rag/rag-types";

export interface HitsPromptInput {
  tenantId: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  ragContext?: RAGMergedContext;
}

export function buildHitsPrompt(input: HitsPromptInput): string {
  const contextChunks =
    input.ragContext?.chunks
      .map(
        (chunk, index) =>
          `Context ${index + 1} [${chunk.source} | ${chunk.priority}]: ${chunk.content}`,
      )
      .join("\n\n") || "No enterprise RAG context available.";

  return `
You are the ClinixAI Literature Hits Agent.

Your task is to determine whether this literature article is a potential pharmacovigilance hit.

Evaluate:
- Human safety relevance
- Company suspect product relevance
- Adverse event / special situation presence
- Literature case validity signals
- Country / COI relevance if available
- Whether the article should move to Screening

Tenant ID:
${input.tenantId}

Product:
${input.productName || "Not specified"}

Country:
${input.country || "Not specified"}

Article Title:
${input.articleTitle || "Not available"}

Abstract:
${input.abstractText || "Not available"}

Full Text Snippet:
${input.fullTextSnippet || "Not available"}

Enterprise Context:
${contextChunks}

Return ONLY valid JSON with this structure:
{
  "isHit": true,
  "confidence": 0.0,
  "classification": "hit | no_hit | needs_manual_review",
  "reasons": ["reason 1"],
  "detectedProducts": ["product"],
  "detectedEvents": ["event"],
  "detectedSpecialSituations": ["situation"],
  "recommendedNextStep": "send_to_screening | reject | manual_review"
}
`.trim();
}