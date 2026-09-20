import type { RAGMergedContext } from "@/lib/rag/rag-types";

export interface HitsPromptInput {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  articleAuthors?: string[];
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

Determine whether the publication contains potential human patient-safety information and should proceed to Literature Screening. Patient-safety relevance is assessed before any company-product or MAH applicability decision.

--------------------------------------------------

EVALUATION CHECKLIST

Evaluate, in this order:
1. Medicinal products and their exact reported roles.
2. Human patient-safety evidence: human/animal population, medicinal-product exposure, adverse event/reaction, and PV special situations.
3. Generic literature ICSR evidence: identifiable patient, identifiable reporter, suspect product, and adverse event/reaction or special situation.
4. Duplicate indication and other medical relevance.

Do not decide company ownership, Product Master membership, MAH status, licence status, or final client applicability. Those are deterministic downstream decisions.

--------------------------------------------------

ARTICLE

Tenant: ${input.tenantId}
Article ID: ${input.articleId ?? "Not Available"}
Product: ${input.productName ?? "Not Available"}
Country: ${input.country ?? "Not Available"}
Title: ${input.articleTitle ?? "Not Available"}
Authors: ${(input.articleAuthors ?? []).join(", ") || "Not Available"}
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

The following tenant configuration may include Product Master, Literature Calendar, client guidelines, outcome template, and literature-source records. Use it only as contextual governed configuration. Do not decide company ownership in the AI response. If Product Master is absent, that means company applicability is unresolved, not that a reported medicine is a non-company product.

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
  "safetyEvidence": {
    "populationType": "HUMAN | ANIMAL | MIXED | UNRESOLVED",
    "patientIdentifiable": "PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "reporterIdentifiable": "PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "medicinalProductExposure": "PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "adverseEventOrReaction": "PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "specialSituation": "PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "patientEvidence": "short source span supporting patient status",
    "reporterEvidence": "short source span supporting reporter status",
    "productEvidence": "short source span supporting medicinal-product exposure",
    "eventEvidence": "short source span supporting adverse event/reaction",
    "specialSituationEvidence": "short source span supporting special situation"
  },
  "extractedSuspectEvidence": [
    {
      "reportedProduct": "exact suspect wording from the source",
      "reportedChemicalName": "chemical name if explicitly reported",
      "reportedComposition": "composition if explicitly reported",
      "reportedDosageForm": "dosage form if explicitly reported",
      "reportedFormulation": "formulation/presentation if explicitly reported",
      "reportedAdministrationRoute": "route actually administered if explicitly reported",
      "presentationQualifierRole": "PRODUCT_PRESENTATION | ADMINISTRATION_CIRCUMSTANCE | NOT_REPORTED | UNCLEAR",
      "countryOfInterest": "COI only when supported by the governed COI evidence hierarchy",
      "relevantDate": "YYYY-MM-DD only when supported",
      "sourceEvidence": "short verbatim evidence span",
      "role": "SUSPECT | CONCOMITANT | TREATMENT | EXPOSURE | PRODUCT_MENTION | UNRESOLVED",
      "roleEvidence": "source wording supporting the role",
      "evidenceLocation": "TITLE | ABSTRACT | KEYWORDS | TABLE | FIGURE | CAPTION | SUPPLEMENT | FULL_TEXT | UNKNOWN",
      "components": ["component names for a combination product"],
      "conflictingEvidence": ["contradictory product statements"]
    }
  ],
  "knowledgeCitationIds": [],
  "recommendedNextStep": "send_to_screening"
}

classification must be one of: hit, no_hit, needs_manual_review.
recommendedNextStep must be one of: send_to_screening, reject, manual_review.
knowledgeCitationIds must contain only citation IDs explicitly supplied above and directly supporting the decision.
Extract every medicinal product separately, including multiple suspects, concomitants, treatment products, exposures, and product mentions. Preserve exact source wording and location. Treat a fixed combination as one reported suspect entity while preserving its components. Record contradictions without resolving them silently. Distinguish a formulation/presentation qualifier from an administration circumstance.

For safetyEvidence, extract evidence only. "PRESENT" requires explicit support in the supplied article; "ABSENT" requires evidence that the element is absent or clearly inapplicable; otherwise use "UNRESOLVED". Do not convert silence into ABSENT. Patient safety is independent of company ownership. A medicine may be safety relevant even when company applicability cannot yet be determined.

Do not decide company ownership, licence status, MAH status, or pharmaceutical equivalence; deterministic governed assessment occurs after extraction.
`.trim();
}
