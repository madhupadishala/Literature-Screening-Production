import "server-only";

import {
  activeReviewReferenceData,
  type ActiveLabelReference,
  type ReviewReferenceUsageScope,
} from "@/lib/literature/review/review-reference-service";

import {
  assessListedness,
  listednessSearchTerms,
} from "./listedness-engine";
import { searchBoundLabelDocument } from "./label-knowledge-search";
import type {
  ListednessAssessment,
  ListednessCaseContext,
  ListednessLabContext,
  ListednessLabelEvidence,
} from "./types";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateInRange(
  relevantDate: string | undefined,
  from: string | undefined,
  to: string | undefined,
  usageScope: ReviewReferenceUsageScope,
): boolean {
  if (!relevantDate) return true;
  if (!from) return usageScope === "VALIDATION_ONLY";
  const target = Date.parse(relevantDate);
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(target) || !Number.isFinite(start)) return false;
  if (to && !Number.isFinite(end)) return false;
  return target >= start && target <= end;
}

function structuredReferenceEvidence(
  reference: ActiveLabelReference,
): ListednessLabelEvidence[] {
  return reference.eventTerms.map((term) => ({
    text: `Listed adverse reaction: ${term}.`,
    section: "Governed LABEL_REFERENCE eventTerms",
    documentId: reference.labelKey,
    documentType: reference.labelType,
    documentVersion: reference.version,
    effectiveDate: reference.effectiveFrom,
    subjectProduct: reference.clientProductId,
  }));
}

export interface ListednessKnowledgeRequest {
  tenantId: string;
  clientProductId: string;
  country: string;
  reportedEvent: string;
  relevantDate?: string;
  eventKind?: "CLINICAL_EVENT" | "LAB";
  caseContext?: ListednessCaseContext;
  labContext?: ListednessLabContext;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  requireDocumentEvidence?: boolean;
  usageScope?: ReviewReferenceUsageScope;
}

export interface ListednessKnowledgeAssessment {
  reference: ActiveLabelReference | null;
  assessment: ListednessAssessment;
  retrieval: {
    evidenceMode:
      | "CONTROLLED_KNOWLEDGE_DOCUMENT"
      | "STRUCTURED_LABEL_REFERENCE"
      | "NONE";
    queryTerms: string[];
    matchedChunks: number;
    searchedChunks: number;
    documentAvailable: boolean;
    citationIds: string[];
    sourceDocument?: string;
  };
}

function documentTypeRank(country: string, labelType: string): number {
  const market = normalize(country);
  const type = normalize(labelType);

  if (market === "united states" || market === "usa" || market === "us") {
    if (type === "uspi") return 0;
    if (type === "package insert") return 1;
    if (type === "pi") return 2;
  }

  if (
    market === "united kingdom" ||
    market.includes("european union") ||
    market.includes("eea")
  ) {
    if (type === "smpc" || type === "spc") return 0;
    if (type === "ccds" || type === "ccsi" || type === "core safety information") return 1;
    if (type === "pi") return 2;
  }

  if (market === "india" || market === "singapore" || market === "china") {
    if (type === "pi") return 0;
    if (type === "package insert") return 1;
    if (type === "smpc") return 2;
  }

  if (type === "ccds" || type === "ccsi" || type === "core safety information") return 3;
  if (type === "smpc" || type === "spc") return 4;
  if (type === "uspi") return 5;
  if (type === "pi" || type === "package insert") return 6;
  if (type === "ib" || type === "rsi") return 7;
  return 99;
}

export async function resolveListednessReference(input: {
  tenantId: string;
  clientProductId: string;
  country: string;
  relevantDate?: string;
  usageScope?: ReviewReferenceUsageScope;
}): Promise<ActiveLabelReference | null> {
  const usageScope = input.usageScope ?? "PRODUCTION";
  const references = (await activeReviewReferenceData(input.tenantId)).labelReferences;

  const candidates = references.filter((reference) =>
    reference.usageScope === usageScope &&
    normalize(reference.clientProductId) === normalize(input.clientProductId) &&
    normalize(reference.country) === normalize(input.country) &&
    (usageScope !== "PRODUCTION" || !reference.productionUseBlocked) &&
    dateInRange(
      input.relevantDate,
      reference.effectiveFrom,
      reference.effectiveTo,
      usageScope,
    ),
  );

  candidates.sort((left, right) => {
    const typeDifference =
      documentTypeRank(input.country, left.labelType) -
      documentTypeRank(input.country, right.labelType);
    if (typeDifference !== 0) return typeDifference;

    const leftDate = left.effectiveFrom ? Date.parse(left.effectiveFrom) : 0;
    const rightDate = right.effectiveFrom ? Date.parse(right.effectiveFrom) : 0;
    return rightDate - leftDate || left.labelKey.localeCompare(right.labelKey);
  });

  return candidates[0] || null;
}

async function retrieveLabelEvidence(input: {
  request: ListednessKnowledgeRequest;
  reference: ActiveLabelReference;
}) {
  const usageScope = input.request.usageScope ?? "PRODUCTION";
  const result = await searchBoundLabelDocument({
    tenantId: input.request.tenantId,
    labelKey: input.reference.knowledgeObjectId || input.reference.labelKey,
    labelType: input.reference.labelType,
    labelVersion: input.reference.version,
    clientProductId: input.reference.clientProductId,
    reportedEvent: input.request.reportedEvent,
    effectiveFrom: input.reference.effectiveFrom,
    usageScope,
  });

  if (result.documentAvailable) {
    return {
      ...result,
      evidenceMode: "CONTROLLED_KNOWLEDGE_DOCUMENT" as const,
    };
  }

  const fallback = structuredReferenceEvidence(input.reference);
  return {
    ...result,
    evidence: fallback,
    evidenceMode: fallback.length
      ? ("STRUCTURED_LABEL_REFERENCE" as const)
      : ("NONE" as const),
  };
}

export async function assessListednessFromKnowledgeBase(
  request: ListednessKnowledgeRequest,
): Promise<ListednessKnowledgeAssessment> {
  const usageScope = request.usageScope ?? "PRODUCTION";
  const reference = await resolveListednessReference({
    tenantId: request.tenantId,
    clientProductId: request.clientProductId,
    country: request.country,
    relevantDate: request.relevantDate,
    usageScope,
  });

  if (!reference) {
    return {
      reference: null,
      assessment: assessListedness({
        reportedEvent: request.reportedEvent,
        eventKind: request.eventKind,
        caseContext: request.caseContext,
        labContext: request.labContext,
        labelEvidence: [],
      }),
      retrieval: {
        evidenceMode: "NONE",
        queryTerms: listednessSearchTerms(request.reportedEvent),
        matchedChunks: 0,
        searchedChunks: 0,
        documentAvailable: false,
        citationIds: [],
      },
    };
  }

  const retrieved = await retrieveLabelEvidence({
    request: { ...request, usageScope },
    reference,
  });

  if (!retrieved.documentAvailable) {
    if (
      request.requireDocumentEvidence === true ||
      retrieved.evidenceMode === "NONE"
    ) {
      return {
        reference,
        assessment: {
          reportedEvent: request.reportedEvent,
          normalizedEvent: normalize(request.reportedEvent),
          listedness: "UNRESOLVED",
          manualReviewRequired: true,
          reasonCode: "LABEL_DOCUMENT_EVIDENCE_NOT_AVAILABLE",
          rationale:
            "The governed label reference resolved, but its bound knowledge document is not available in the active label repository.",
          evidenceDecisions: [],
        },
        retrieval: {
          evidenceMode: retrieved.evidenceMode,
          queryTerms: retrieved.queryTerms,
          matchedChunks: 0,
          searchedChunks: 0,
          documentAvailable: false,
          citationIds: [],
          sourceDocument: reference.sourceDocument,
        },
      };
    }

    const fallbackAssessment = assessListedness({
      reportedEvent: request.reportedEvent,
      eventKind: request.eventKind,
      caseContext: request.caseContext,
      labContext: request.labContext,
      labelEvidence: retrieved.evidence,
    });

    return {
      reference,
      assessment: fallbackAssessment,
      retrieval: {
        evidenceMode: retrieved.evidenceMode,
        queryTerms: retrieved.queryTerms,
        matchedChunks: retrieved.evidence.length,
        searchedChunks: 0,
        documentAvailable: false,
        citationIds: [],
        sourceDocument: reference.sourceDocument,
      },
    };
  }

  if (retrieved.evidence.length === 0) {
    return {
      reference,
      assessment: {
        reportedEvent: request.reportedEvent,
        normalizedEvent: normalize(request.reportedEvent),
        listedness: "UNLISTED",
        manualReviewRequired: false,
        reasonCode: "NO_LISTED_EVENT_FOUND_AFTER_DOCUMENT_SEARCH",
        rationale:
          "The governed label document was available and searched using normalized event terms, spelling variants and controlled synonyms, but no supporting event concept was found.",
        evidenceDecisions: [],
      },
      retrieval: {
        evidenceMode: "CONTROLLED_KNOWLEDGE_DOCUMENT",
        queryTerms: retrieved.queryTerms,
        matchedChunks: 0,
        searchedChunks: retrieved.searchedChunks,
        documentAvailable: true,
        citationIds: [],
        sourceDocument: reference.sourceDocument,
      },
    };
  }

  const assessment = assessListedness({
    reportedEvent: request.reportedEvent,
    eventKind: request.eventKind,
    caseContext: request.caseContext,
    labContext: request.labContext,
    labelEvidence: retrieved.evidence,
  });

  return {
    reference,
    assessment,
    retrieval: {
      evidenceMode: "CONTROLLED_KNOWLEDGE_DOCUMENT",
      queryTerms: retrieved.queryTerms,
      matchedChunks: retrieved.evidence.length,
      searchedChunks: retrieved.searchedChunks,
      documentAvailable: true,
      citationIds: retrieved.citationIds,
      sourceDocument: reference.sourceDocument,
    },
  };
}
