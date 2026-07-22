import type { RAGMergedContext } from "@/lib/rag/rag-types";

export interface HitsPromptInput {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  ragContext?: RAGMergedContext;
  runtimeConfiguration?: Record<string, unknown>;
}

function governedConfiguration(input?: Record<string, unknown>): string {
  if (!input) return "No active tenant configuration was resolved.";
  return JSON.stringify(input, null, 2).slice(0, 40_000);
}

function buildEnterpriseContext(ragContext?: RAGMergedContext): string {
  if (!ragContext || ragContext.chunks.length === 0) {
    return "No approved governed knowledge was retrieved. Escalate uncertainty for manual review.";
  }

  return ragContext.chunks
    .map((chunk, index) => {
      const citation = chunk.citation;
      return [
        `Knowledge ${index + 1}`,
        `Knowledge Object: ${citation?.knowledgeObjectId ?? chunk.sourceId}`,
        `Title: ${citation?.title ?? chunk.sourceName ?? "Not Available"}`,
        `Version: ${citation?.version ?? "Not Available"}`,
        `Section: ${citation?.section ?? "Not Available"}`,
        `Regulatory Reference: ${citation?.regulatoryReference ?? "Not Available"}`,
        `Citation ID: ${citation?.citationId ?? "Not Available"}`,
        `Content Hash: ${citation?.contentHashSha256 ?? "Not Available"}`,
        `Retrieval Score: ${chunk.score.toFixed(4)}`,
        "Content:",
        chunk.content,
      ].join("\n");
    })
    .join("\n\n----------------------------------------\n\n");
}

export function buildHitsPrompt(input: HitsPromptInput): string {
  return `
SYSTEM

You are the ClinixAI Literature Hits Agent operating inside a governed pharmacovigilance workflow.

Your responsibility is only to determine whether the supplied article is a potential pharmacovigilance literature hit. Do not perform screening or intake. Do not invent, infer unsupported facts, or use external knowledge.

Use only:
1. The supplied article information.
2. The approved governed enterprise knowledge supplied below.

When the evidence is absent, conflicting, or insufficient, choose needs_manual_review. Treat governed knowledge citations as evidence provenance; never modify or fabricate their identifiers.

--------------------------------------------------

OBJECTIVE

Determine whether the publication should proceed to Literature Screening.

--------------------------------------------------

EVALUATION CHECKLIST

Evaluate company suspect product, generic or brand name, active ingredient, adverse event, seriousness, special situation, human patient, literature case report, safety relevance, country of interest, duplicate indication, signal relevance, and medical relevance only when supported by the supplied evidence.

--------------------------------------------------

ARTICLE

Tenant: ${input.tenantId}
Article ID: ${input.articleId ?? "Not Available"}
Product: ${input.productName ?? "Not Available"}
Country: ${input.country ?? "Not Available"}
Title: ${input.articleTitle ?? "Not Available"}
Abstract: ${input.abstractText ?? "Not Available"}
Full Text Snippet: ${input.fullTextSnippet ?? "Not Available"}

--------------------------------------------------

APPROVED GOVERNED ENTERPRISE KNOWLEDGE

Context Pack: ${input.ragContext?.contextPackId ?? "Not Available"}
Repository Version: ${input.ragContext?.repositoryVersion ?? "Not Available"}
Repository Manifest: ${input.ragContext?.repositoryManifestSha256 ?? "Not Available"}

${buildEnterpriseContext(input.ragContext)}

--------------------------------------------------

ACTIVE TENANT CONFIGURATION

The following Product Master, Literature Calendar, client guidelines, outcome template, and literature-source records are effective for this tenant. Use them as deterministic tenant rules. Do not treat an unlisted product as a company product.

${governedConfiguration(input.runtimeConfiguration)}

--------------------------------------------------

OUTPUT RULES

Return strict JSON only, without markdown, explanation, or additional text.

{
  "isHit": true,
  "confidence": 0.95,
  "classification": "hit",
  "reasons": [],
  "detectedProducts": [],
  "detectedEvents": [],
  "detectedSpecialSituations": [],
  "knowledgeCitationIds": [],
  "recommendedNextStep": "send_to_screening"
}

classification must be one of: hit, no_hit, needs_manual_review.
recommendedNextStep must be one of: send_to_screening, reject, manual_review.
knowledgeCitationIds must contain only citation IDs explicitly supplied above and directly supporting the decision.
`.trim();
}
