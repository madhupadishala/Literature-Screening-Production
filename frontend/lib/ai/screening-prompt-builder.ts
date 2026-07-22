import type { ScreeningRequest } from "@/lib/literature/screening/screening-types";
import type { RAGMergedContext } from "@/lib/rag/rag-types";

export interface ScreeningPromptGovernance {
  ragContext: RAGMergedContext;
  runtimeConfiguration: Record<string, unknown>;
}

function knowledgeContext(context: RAGMergedContext): string {
  if (context.chunks.length === 0) {
    return "No approved governed knowledge was retrieved. Select REVIEW when the decision cannot be supported.";
  }
  return context.chunks
    .map((chunk, index) => {
      const citation = chunk.citation;
      return [
        `[K${index + 1}] ${citation?.knowledgeObjectId ?? chunk.sourceId}`,
        `Citation: ${citation?.citationId ?? "Not Available"}`,
        `Version: ${citation?.version ?? "Not Available"}`,
        `Section: ${citation?.section ?? "Not Available"}`,
        `Regulatory reference: ${citation?.regulatoryReference ?? "Not Available"}`,
        `Content hash: ${citation?.contentHashSha256 ?? "Not Available"}`,
        chunk.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

export class ScreeningPromptBuilder {
  build(request: ScreeningRequest, governance: ScreeningPromptGovernance): string {
    return `
You are the ClinixAI Pharmacovigilance Literature Screening Agent operating within a governed tenant workflow.

Use only the supplied article, effective tenant configuration, and approved controlled knowledge. Do not use unstated external rules. Do not infer a diagnosis, causal relationship, treatment start/stop, patient identity, reporter identity, seriousness, country, or MAH status unless supported by supplied evidence. When evidence is missing, conflicting, or insufficient, select REVIEW.

Apply the governed screening sequence: publication classification, product identity against the active Product Master, patient and reporter validity, adverse event or special-situation evidence, active MAH/country requirements, duplicate status, inclusion/exclusion rules, and manual-review triggers. All publication types remain neutral at Hits; Screening makes the governed decision.

Return strict JSON only:
{
  "decision":"INCLUDE | EXCLUDE | REVIEW",
  "confidence":0-100,
  "reason":"CASE_REPORT | ADVERSE_EVENT | PRODUCT_MENTION | HUMAN_STUDY | ANIMAL_STUDY | REVIEW_ARTICLE | NO_ADVERSE_EVENT | NON_MEDICAL | INSUFFICIENT_INFORMATION | NON_ENGLISH | DUPLICATE | UNKNOWN",
  "findings":[{"rule":"knowledge citation or tenant rule", "passed":true, "score":20, "comment":"evidence-based comment"}],
  "knowledgeCitationIds":[]
}

ARTICLE
PMID: ${request.article.pmid}
Title: ${request.article.title}
Abstract: ${request.article.abstract ?? ""}
Authors: ${request.article.authors.join(", ")}
DOI: ${request.article.doi ?? ""}
Journal: ${request.article.journal ?? ""}
Publication Date: ${request.article.publicationDate ?? ""}
Language: ${request.article.language ?? ""}
Country: ${request.article.country ?? ""}
Keywords: ${(request.article.keywords ?? []).join(", ")}
MeSH Terms: ${(request.article.meshTerms ?? []).join(", ")}

ACTIVE TENANT CONFIGURATION
${JSON.stringify(governance.runtimeConfiguration, null, 2).slice(0, 40_000)}

APPROVED CONTROLLED KNOWLEDGE
Context Pack: ${governance.ragContext.contextPackId ?? "Not Available"}
Repository Version: ${governance.ragContext.repositoryVersion ?? "Not Available"}
Repository Manifest: ${governance.ragContext.repositoryManifestSha256 ?? "Not Available"}

${knowledgeContext(governance.ragContext)}

knowledgeCitationIds may contain only citation identifiers supplied above and directly supporting the decision.
`.trim();
  }
}

export const screeningPromptBuilder = new ScreeningPromptBuilder();
