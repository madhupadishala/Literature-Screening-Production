import type { RAGMergedContext } from "@/lib/rag/rag-types";

export interface ScreeningPromptInput {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  ragContext?: RAGMergedContext;
}

export function buildScreeningPrompt(input: ScreeningPromptInput): string {
  const contextChunks =
    input.ragContext?.chunks
      .map(
        (chunk, index) =>
          `Context ${index + 1} [${chunk.source} | ${chunk.priority}]: ${chunk.content}`,
      )
      .join("\n\n") || "No enterprise RAG context available.";

  return `
You are the ClinixAI Literature Screening Agent.

Extract structured pharmacovigilance screening information from the literature article.

Evaluate:
- Product relevance
- Patient identifiers
- Reporter identifiers
- Adverse events
- Seriousness
- Special situations
- Country of interest
- Validity
- Reasoning for human reviewer

Tenant ID:
${input.tenantId}

Article ID:
${input.articleId || "Not specified"}

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
  "validity": {
    "isValidCase": true,
    "hasIdentifiablePatient": true,
    "hasIdentifiableReporter": true,
    "hasCompanySuspectProduct": true,
    "hasAdverseEvent": true,
    "reasoning": ["reason"]
  },
  "patient": {
    "identifiers": ["adult male"],
    "age": "45",
    "sex": "male",
    "country": "India"
  },
  "reporter": {
    "primaryReporter": "author name",
    "reporterType": "literature_author",
    "country": "India"
  },
  "products": {
    "companySuspects": ["product"],
    "coSuspects": [],
    "concomitants": [],
    "treatmentProducts": []
  },
  "events": {
    "adverseEvents": ["event"],
    "seriousnessCriteria": ["death", "life_threatening", "hospitalization"],
    "isSerious": true
  },
  "specialSituations": ["pregnancy", "overdose", "medication_error", "lack_of_efficacy"],
  "countryOfInterest": {
    "country": "India",
    "isCOI": true,
    "reasoning": "reason"
  },
  "classification": "valid_case | invalid_case | special_situation_only | needs_manual_review",
  "confidence": 0.0,
  "reviewerNotes": ["note"],
  "recommendedNextStep": "send_to_intake | reject | manual_review"
}
`.trim();
}