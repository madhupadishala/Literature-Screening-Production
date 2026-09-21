import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGMergedContext } from "@/lib/rag/rag-types";
import { buildTenantRuntimeConfigurationContext } from "@/lib/configuration/runtime-context";

import { recordAIAudit } from "./ai-audit";
import { recordAIMetric } from "./ai-metrics";
import { createAIRequestId } from "./ai-runtime";
import { buildHitsPrompt } from "./hits-prompt-builder";
import {
  parseHitsAIResult,
  type HitsAIResult,
} from "./hits-result-parser";
import { aiProviderFactory } from "./provider-factory";
import { assessCompanySuspect } from "@/lib/pharmaceutical-intelligence/assessment-engine";
import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";
import { assessPVDecisionArchitecture } from "@/lib/pv-decision-intelligence/assessment-engine";

export interface HitsAgentRequest {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  articleAuthors?: string[];
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

function normalizeProductText(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string): number {
  if (!left || !right) return Math.max(left.length, right.length);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}

function sourceContainsTerm(source: string, term: string): boolean {
  const normalizedSource = ` ${normalizeProductText(source)} `;
  const normalizedTerm = normalizeProductText(term);
  return Boolean(normalizedTerm) && normalizedSource.includes(` ${normalizedTerm} `);
}


function stripTrailingStrengthQualifier(input: {
  reportedProduct: string;
  sourceExactTerms: string[];
}): string | undefined {
  const reportedNormalized = normalizeProductText(input.reportedProduct);
  if (!reportedNormalized) return undefined;

  const candidates = input.sourceExactTerms.flatMap((term) => {
    const normalizedTerm = normalizeProductText(term);
    if (
      !normalizedTerm ||
      reportedNormalized === normalizedTerm ||
      !reportedNormalized.startsWith(normalizedTerm + " ")
    ) {
      return [];
    }

    const remainder = reportedNormalized.slice(normalizedTerm.length).trim();
    const tokens = remainder.split(" ").filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return [];

    const strengthUnit = /^(?:mg|g|mcg|ug|µg|ml|l|iu|unit|units|meq|mmol|mol|%|percent)$/i;
    const numberToken = /^\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?$/;
    const connector = /^(?:per|\/|x)$/i;

    const strengthLike =
      tokens.some((token) => numberToken.test(token)) &&
      tokens.every(
        (token) =>
          numberToken.test(token) ||
          strengthUnit.test(token) ||
          connector.test(token),
      );

    return strengthLike ? [term] : [];
  });

  const unique = [
    ...new Map(
      candidates.map((candidate) => [normalizeProductText(candidate), candidate]),
    ).values(),
  ];
  return unique.length === 1 ? unique[0] : undefined;
}

function productMasterSourceTerms(productMaster: unknown): string[] {
  if (!productMaster || typeof productMaster !== "object" || Array.isArray(productMaster)) {
    return [];
  }
  const payload = productMaster as Record<string, unknown>;
  const records = Array.isArray(payload.records) ? payload.records : [];
  const terms = new Set<string>();

  for (const item of records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    for (const key of [
      "brandName",
      "genericName",
      "inn",
      "api",
      "composition",
      "chemicalNames",
      "saltForms",
      "synonyms",
    ]) {
      const value = record[key];
      if (typeof value === "string") {
        for (const part of value.split(/[|,;]+/)) {
          const cleaned = part.trim();
          if (cleaned) terms.add(cleaned);
        }
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === "string" && entry.trim()) terms.add(entry.trim());
        }
      }
    }
  }

  return [...terms];
}

function reconcileSuspectEvidence(input: {
  aiResult: HitsAIResult;
  request: HitsAgentRequest;
  productMaster: unknown;
}): {
  evidence: SuspectProductEvidence[];
  corrections: Array<{ from: string; to: string; reason: string }>;
} {
  const source = [
    input.request.articleTitle,
    input.request.abstractText,
    input.request.fullTextSnippet,
  ]
    .filter(Boolean)
    .join(" ");
  const detectedProducts = [
    ...new Set(
      input.aiResult.detectedProducts
        .map((product) => product.trim())
        .filter(Boolean),
    ),
  ];
  const configuredSourceTerms = productMasterSourceTerms(input.productMaster).filter((term) =>
    sourceContainsTerm(source, term),
  );
  const corrections: Array<{ from: string; to: string; reason: string }> = [];

  const evidence = input.aiResult.extractedSuspectEvidence.map((item) => {
    if (sourceContainsTerm(source, item.reportedProduct)) {
      const identityWithoutStrength = stripTrailingStrengthQualifier({
        reportedProduct: item.reportedProduct,
        sourceExactTerms: configuredSourceTerms,
      });
      if (identityWithoutStrength) {
        corrections.push({
          from: item.reportedProduct,
          to: identityWithoutStrength,
          reason:
            "Source-exact product identity was separated from a trailing strength qualifier for Product Master matching; the original phrase remains preserved in source evidence.",
        });
        return {
          ...item,
          reportedProduct: identityWithoutStrength,
        };
      }
      return item;
    }

    const reported = normalizeProductText(item.reportedProduct);
    const candidates = [
      ...detectedProducts.filter(
        (candidate) =>
          sourceContainsTerm(source, candidate) &&
          editDistance(normalizeProductText(candidate), reported) <= 2,
      ),
      ...configuredSourceTerms.filter(
        (candidate) =>
          editDistance(normalizeProductText(candidate), reported) <= 2,
      ),
    ];
    const uniqueCandidates = [
      ...new Map(
        candidates.map((candidate) => [normalizeProductText(candidate), candidate]),
      ).values(),
    ];

    if (uniqueCandidates.length !== 1) {
      return item;
    }

    const corrected = uniqueCandidates[0];
    corrections.push({
      from: item.reportedProduct,
      to: corrected,
      reason:
        "AI product spelling was reconciled only because one near-match detected product is explicitly present in the supplied article text.",
    });
    const correctedNormalized = normalizeProductText(corrected);
    const reconcileOptionalIdentityField = (value: string | undefined) => {
      if (!value || sourceContainsTerm(source, value)) return value;
      return editDistance(normalizeProductText(value), correctedNormalized) <= 2
        ? corrected
        : value;
    };

    return {
      ...item,
      reportedProduct: corrected,
      reportedChemicalName: reconcileOptionalIdentityField(item.reportedChemicalName),
      reportedComposition: reconcileOptionalIdentityField(item.reportedComposition),
    };
  });

  return { evidence, corrections };
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
      const runtimeConfiguration = await buildTenantRuntimeConfigurationContext(request.tenantId);

      const prompt = buildHitsPrompt({
        tenantId: request.tenantId,
        articleId: request.articleId,
        articleTitle: request.articleTitle,
        articleAuthors: request.articleAuthors,
        abstractText: request.abstractText,
        fullTextSnippet: request.fullTextSnippet,
        productName: request.productName,
        country: request.country,
        ragContext: ragResponse.context,
        runtimeConfiguration,
      });

      const provider = aiProviderFactory.getProvider();
      const aiResponse = await provider.complete({
        systemPrompt:
          "You are the ClinixAI Literature Hits Agent. Return one valid JSON object only. Do not add markdown or commentary.",
        userPrompt: prompt,
        responseFormat: "json",
        requestId,
      });

      const aiResult = parseHitsAIResult(aiResponse.content);
      const productReconciliation = reconcileSuspectEvidence({
        aiResult,
        request,
        productMaster: runtimeConfiguration.productMaster,
      });
      const pvDecision = assessPVDecisionArchitecture({
        safetyEvidence: aiResult.safetyEvidence,
        detectedEvents: aiResult.detectedEvents,
        detectedSpecialSituations: aiResult.detectedSpecialSituations,
        suspectEvidence: productReconciliation.evidence,
        reporterIdentifiers: request.articleAuthors,
      });
      const companySuspectAssessments = productReconciliation.evidence.map((evidence) =>
        assessCompanySuspect({
          evidence,
          productMaster: runtimeConfiguration.productMaster,
        }),
      );
      const requiresProductReview = companySuspectAssessments.some(
        (assessment) => assessment.manualReviewRequired,
      );
      const requiresSafetyReview = pvDecision.patientSafety.manualReviewRequired;
      const safetyRelevantButAiRejected =
        pvDecision.patientSafety.relevance === "RELEVANT" &&
        aiResult.classification === "no_hit";
      const requiresManualReview =
        requiresProductReview ||
        requiresSafetyReview ||
        safetyRelevantButAiRejected;
      const result: HitsAIResult = {
        ...aiResult,
        isHit:
          pvDecision.patientSafety.relevance === "RELEVANT"
            ? true
            : pvDecision.patientSafety.relevance === "NOT_RELEVANT"
              ? false
              : aiResult.isHit,
        extractedSuspectEvidence: productReconciliation.evidence,
        patientSafetyAssessment: pvDecision.patientSafety,
        icsrAssessment: pvDecision.icsr,
        companySuspectAssessments,
        classification: requiresManualReview ? "needs_manual_review" : aiResult.classification,
        recommendedNextStep: requiresManualReview ? "manual_review" : aiResult.recommendedNextStep,
        qcRequired: requiresManualReview || aiResult.qcRequired,
        reasons: [
          ...aiResult.reasons,
          `Patient safety: ${pvDecision.patientSafety.relevance}`,
          `Generic ICSR: ${pvDecision.icsr.conclusion}`,
          ...productReconciliation.corrections.map(
            (correction) =>
              `Product spelling reconciled from "${correction.from}" to source-exact "${correction.to}".`,
          ),
          ...companySuspectAssessments.map(
            (assessment) =>
              `${assessment.reportedProduct}: ${assessment.conclusion} (${assessment.assessmentId})`,
          ),
        ],
      };

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

      await recordAIAudit({
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
          knowledgeContextPackId: ragResponse.context.contextPackId,
          knowledgeCitationIds: ragResponse.context.citations?.map((citation) => citation.citationId) || [],
          configurationSnapshot: runtimeConfiguration.snapshot,
          pharmaceuticalKnowledgeVersion:
            companySuspectAssessments[0]?.knowledgeVersion || null,
          patientSafetyAssessment: pvDecision.patientSafety,
          icsrAssessment: pvDecision.icsr,
          companySuspectAssessments,
          productReconciliations: productReconciliation.corrections,
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
      await recordAIAudit({
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
