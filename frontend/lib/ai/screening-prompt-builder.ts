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

Apply the governed screening sequence in separate layers:
1. Extract medicinal products and their reported roles.
2. Determine human patient-safety relevance from article evidence, independent of company ownership.
3. Evaluate generic minimum literature ICSR evidence: identifiable patient, identifiable reporter, suspect product, and adverse event/reaction or special situation.
4. Extract publication classification, clinical events, severity, seriousness evidence, patient PII status, and country-of-incidence evidence without guessing.
5. Only after those layers, evaluate company-product and MAH applicability through deterministic governed logic.
6. Apply duplicate, inclusion/exclusion and manual-review rules.

Do not convert a missing Product Master into a non-company-product conclusion. Missing company configuration requires an UNRESOLVED company-applicability state and manual review while safety assessment continues.

Return strict JSON only:
{
  "decision":"INCLUDE | EXCLUDE | REVIEW",
  "confidence":0-100,
  "reason":"CASE_REPORT | ADVERSE_EVENT | PRODUCT_MENTION | HUMAN_STUDY | ANIMAL_STUDY | REVIEW_ARTICLE | NO_ADVERSE_EVENT | NON_MEDICAL | INSUFFICIENT_INFORMATION | NON_ENGLISH | DUPLICATE | UNKNOWN",
  "findings":[{"rule":"knowledge citation or tenant rule", "passed":true, "score":20, "comment":"evidence-based comment"}],
  "regulatoryEvidence":{
    "publicationClassification":"CASE_REPORT | CASE_SERIES | CLINICAL_TRIAL | OBSERVATIONAL_STUDY | REVIEW_ARTICLE | META_ANALYSIS | CONFERENCE_ABSTRACT | EDITORIAL | LETTER | ANIMAL_STUDY | IN_VITRO_STUDY | REGISTRY_STUDY | DATABASE_ANALYSIS | OTHER | UNRESOLVED",
    "publicationClassificationEvidence":"short source span",
    "clinicalEvents":[{
      "event":"event term exactly as supported",
      "evidence":"short source span",
      "severity":"MILD | MODERATE | SEVERE | UNRESOLVED",
      "seriousness":"SERIOUS | NON_SERIOUS | UNRESOLVED",
      "seriousnessCriteria":["DEATH | LIFE_THREATENING | HOSPITALIZATION | DISABILITY | CONGENITAL_ANOMALY | OTHER_MEDICALLY_IMPORTANT | NONE_IDENTIFIED"]
    }],
    "patientPiiStatus":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "patientPiiEvidence":"direct patient identifier evidence only",
    "countryOfIncidenceStatus":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "countryOfIncidence":"country only when supported by the article",
    "countryOfIncidenceEvidence":"short source span"
  },
  "safetyEvidence":{
    "populationType":"HUMAN | ANIMAL | MIXED | UNRESOLVED",
    "patientIdentifiable":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "reporterIdentifiable":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "medicinalProductExposure":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "adverseEventOrReaction":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "specialSituation":"PRESENT | ABSENT | UNRESOLVED | CONFLICTING",
    "patientEvidence":"short source span supporting patient status",
    "reporterEvidence":"short source span supporting reporter status",
    "productEvidence":"short source span supporting medicinal-product exposure",
    "eventEvidence":"short source span supporting adverse event/reaction",
    "specialSituationEvidence":"short source span supporting special situation"
  },
  "extractedSuspectEvidence":[{
    "reportedProduct":"exact suspect wording from source",
    "reportedChemicalName":"chemical name if explicitly reported",
    "reportedComposition":"composition if explicitly reported",
    "reportedDosageForm":"dosage form if explicitly reported",
    "reportedFormulation":"formulation/presentation if explicitly reported",
    "reportedAdministrationRoute":"route actually administered if explicitly reported",
    "presentationQualifierRole":"PRODUCT_PRESENTATION | ADMINISTRATION_CIRCUMSTANCE | NOT_REPORTED | UNCLEAR",
    "countryOfInterest":"COI only when supported by governed COI evidence",
    "relevantDate":"YYYY-MM-DD only when supported",
    "sourceEvidence":"short verbatim evidence span",
    "role":"SUSPECT | CONCOMITANT | TREATMENT | EXPOSURE | PRODUCT_MENTION | UNRESOLVED",
    "roleEvidence":"source wording supporting the role",
    "evidenceLocation":"TITLE | ABSTRACT | KEYWORDS | TABLE | FIGURE | CAPTION | SUPPLEMENT | FULL_TEXT | UNKNOWN",
    "components":["component names for a combination product"],
    "conflictingEvidence":["contradictory product statements"]
  }],
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
Existing governed COI context (may be blank; do not infer from this label alone): ${request.article.country ?? ""}
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
Preserve every suspect exactly as reported and distinguish product formulation/presentation from the route by which an identified product was administered.

For safetyEvidence and regulatoryEvidence, extract evidence only. Use PRESENT only when directly supported. Use ABSENT only when absence or inapplicability is explicitly supported; otherwise use UNRESOLVED. Patient safety is assessed before and independently of company ownership.

Keep SEVERITY and SERIOUSNESS separate. Words such as "severe" describe severity and do not by themselves establish regulatory seriousness. Mark SERIOUS only when a recognized seriousness criterion is explicitly supported. If no criterion is established, use UNRESOLVED unless the article explicitly establishes a non-serious outcome.

Patient identifiability for PV case validity is not the same as direct patient PII. Age/sex may support an identifiable patient under the controlled validity rule without establishing direct PII. Do not mark PII PRESENT unless direct identifying information is actually present.

Do not infer Country of Incidence from journal, author affiliation, MAH country, publication database, patient nationality, ethnicity, residence, or a demonym such as "Indian female". Country of Incidence requires evidence that the patient/event actually occurred in that country. If the source only establishes nationality or demographic origin, return countryOfIncidenceStatus="UNRESOLVED" and leave countryOfIncidence empty.

Publication author metadata is supplied separately from the abstract. Under the governed literature reporter rule, a named publication author may satisfy identifiable-reporter evidence even when the abstract body does not repeat that person's name. Do not mark the reporter absent merely because the abstract text omits the author name.

Do not invent company ownership, pharmaceutical equivalence, COI, MAH, licence status, or dates. The deterministic Pharmaceutical Product Intelligence engine performs those conclusions after evidence extraction.
`.trim();
  }
}

export const screeningPromptBuilder = new ScreeningPromptBuilder();
