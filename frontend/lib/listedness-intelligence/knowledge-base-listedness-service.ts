import "server-only";

import path from "node:path";

import { searchControlledKnowledge } from "@/lib/knowledge/retrieval/controlled-knowledge-service";
import type { ControlledKnowledgeSearchResult } from "@/lib/knowledge/retrieval/controlled-knowledge-types";
import {
  activeReviewReferenceData,
  type ActiveLabelReference,
} from "@/lib/literature/review/review-reference-service";

import {
  assessListedness,
  listednessSearchTerms,
} from "./listedness-engine";
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
  from: string,
  to?: string,
): boolean {
  if (!relevantDate) return true;
  const target = Date.parse(relevantDate);
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(target) || !Number.isFinite(start)) return false;
  if (to && !Number.isFinite(end)) return false;
  return target >= start && target <= end;
}

function sameSourceDocument(
  result: ControlledKnowledgeSearchResult,
  reference: ActiveLabelReference,
): boolean {
  const source = normalize(result.citation.sourceFile);
  const title = normalize(result.citation.title);
  const objectId = normalize(result.citation.knowledgeObjectId);
  const labelKey = normalize(reference.labelKey);
  const configuredSource = normalize(reference.sourceDocument);

  if (labelKey && objectId === labelKey) return true;
  if (labelKey && title.includes(labelKey)) return true;
  if (!configuredSource) return false;

  if (source === configuredSource || title === configuredSource) return true;

  const sourceBase = normalize(path.basename(result.citation.sourceFile || ""));
  const configuredBase = normalize(path.basename(reference.sourceDocument || ""));
  return Boolean(configuredBase && sourceBase === configuredBase);
}

function labelEvidenceFromKnowledge(
  result: ControlledKnowledgeSearchResult,
  reference: ActiveLabelReference,
): ListednessLabelEvidence {
  return {
    text: result.content,
    section: result.citation.section,
    documentId: result.citation.knowledgeObjectId,
    documentType: reference.labelType,
    documentVersion: reference.version,
    effectiveDate: reference.effectiveFrom,
    subjectProduct: reference.clientProductId,
    chunkId: result.citation.chunkId,
  };
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
    citationIds: string[];
    sourceDocument?: string;
  };
}

export async function resolveListednessReference(input: {
  tenantId: string;
  clientProductId: string;
  country: string;
  relevantDate?: string;
}): Promise<ActiveLabelReference | null> {
  const references = (await activeReviewReferenceData(input.tenantId)).labelReferences;

  const candidates = references.filter((reference) =>
    reference.usageScope === "PRODUCTION" &&
    normalize(reference.clientProductId) === normalize(input.clientProductId) &&
    normalize(reference.country) === normalize(input.country) &&
    dateInRange(input.relevantDate, reference.effectiveFrom, reference.effectiveTo),
  );

  candidates.sort((a, b) =>
    Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom),
  );

  return candidates[0] || null;
}

async function retrieveLabelEvidence(input: {
  request: ListednessKnowledgeRequest;
  reference: ActiveLabelReference;
}): Promise<{
  evidence: ListednessLabelEvidence[];
  evidenceMode: "CONTROLLED_KNOWLEDGE_DOCUMENT" | "STRUCTURED_LABEL_REFERENCE";
  queryTerms: string[];
  citationIds: string[];
}> {
  const queryTerms = listednessSearchTerms(input.request.reportedEvent);
  const query = queryTerms.join(" OR ");

  const response = await searchControlledKnowledge({
    tenantId: input.request.tenantId,
    query,
    topK: 30,
    minScore: 0,
    mode: "hybrid",
    actorId: input.request.actorId,
    requestId: input.request.requestId,
    correlationId: input.request.correlationId,
    knowledgeObjectIds: [input.reference.labelKey],
  });

  let matching = response.results.filter((result) =>
    sameSourceDocument(result, input.reference),
  );

  if (matching.length === 0 && input.reference.sourceDocument) {
    const broad = await searchControlledKnowledge({
      tenantId: input.request.tenantId,
      query,
      topK: 30,
      minScore: 0,
      mode: "hybrid",
      actorId: input.request.actorId,
      requestId: input.request.requestId,
      correlationId: input.request.correlationId,
    });
    matching = broad.results.filter((result) =>
      sameSourceDocument(result, input.reference),
    );
  }

  if (matching.length > 0) {
    return {
      evidence: matching.map((result) =>
        labelEvidenceFromKnowledge(result, input.reference),
      ),
      evidenceMode: "CONTROLLED_KNOWLEDGE_DOCUMENT",
      queryTerms,
      citationIds: matching.map((result) => result.citation.citationId),
    };
  }

  return {
    evidence: structuredReferenceEvidence(input.reference),
    evidenceMode: "STRUCTURED_LABEL_REFERENCE",
    queryTerms,
    citationIds: [],
  };
}

export async function assessListednessFromKnowledgeBase(
  request: ListednessKnowledgeRequest,
): Promise<ListednessKnowledgeAssessment> {
  const reference = await resolveListednessReference(request);

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
        citationIds: [],
      },
    };
  }

  const retrieved = await retrieveLabelEvidence({ request, reference });

  if (
    request.requireDocumentEvidence === true &&
    retrieved.evidenceMode !== "CONTROLLED_KNOWLEDGE_DOCUMENT"
  ) {
    return {
      reference,
      assessment: {
        reportedEvent: request.reportedEvent,
        normalizedEvent: normalize(request.reportedEvent),
        listedness: "UNRESOLVED",
        manualReviewRequired: true,
        reasonCode: "LABEL_DOCUMENT_EVIDENCE_NOT_RETRIEVED",
        rationale:
          "The governed label reference was resolved, but no matching chunk from the configured source document was retrieved from the controlled knowledge repository.",
        evidenceDecisions: [],
      },
      retrieval: {
        evidenceMode: retrieved.evidenceMode,
        queryTerms: retrieved.queryTerms,
        matchedChunks: 0,
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
      evidenceMode: retrieved.evidenceMode,
      queryTerms: retrieved.queryTerms,
      matchedChunks: retrieved.evidence.length,
      citationIds: retrieved.citationIds,
      sourceDocument: reference.sourceDocument,
    },
  };
}
