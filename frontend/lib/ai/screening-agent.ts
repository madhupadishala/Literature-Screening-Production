import { ragEngine } from "@/lib/rag/rag-engine";
import type { RAGMergedContext } from "@/lib/rag/rag-types";
import { buildScreeningPrompt } from "./screening-prompt-builder";
import {
  validateScreeningAIResult,
  type ScreeningAIResult,
} from "./screening-validator";

export interface ScreeningAgentRequest {
  tenantId: string;
  articleId?: string;
  articleTitle?: string;
  abstractText?: string;
  fullTextSnippet?: string;
  productName?: string;
  country?: string;
  processArea?: string;
}

export interface ScreeningAgentResponse {
  tenantId: string;
  articleId?: string;
  prompt: string;
  ragContext: RAGMergedContext;
  result: ScreeningAIResult;
  generatedAt: string;
}

function buildRAGQuery(request: ScreeningAgentRequest): string {
  return [
    "literature screening extraction",
    request.articleTitle,
    request.abstractText,
    request.productName,
    request.country,
    "patient reporter adverse event suspect product validity seriousness COI special situation",
  ]
    .filter(Boolean)
    .join(" ");
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractDetectedEvents(text: string): string[] {
  const eventKeywords = [
    "adverse event",
    "reaction",
    "toxicity",
    "death",
    "life-threatening",
    "hospitalization",
    "rash",
    "nausea",
    "vomiting",
    "headache",
    "anaphylaxis",
    "liver injury",
    "renal failure",
  ];

  return eventKeywords.filter((keyword) => text.includes(keyword));
}

function extractSpecialSituations(text: string): string[] {
  const specialSituationKeywords = [
    "pregnancy",
    "overdose",
    "medication error",
    "lack of efficacy",
    "misuse",
    "abuse",
    "occupational exposure",
    "off-label",
  ];

  return specialSituationKeywords.filter((keyword) => text.includes(keyword));
}

function extractSeriousnessCriteria(text: string): string[] {
  const seriousnessMap: Record<string, string> = {
    death: "death",
    fatal: "death",
    "life-threatening": "life_threatening",
    hospitalization: "hospitalization",
    disability: "disability",
    congenital: "congenital_anomaly",
  };

  return Object.entries(seriousnessMap)
    .filter(([keyword]) => text.includes(keyword))
    .map(([, criterion]) => criterion);
}

function mockScreeningLLMResponse(request: ScreeningAgentRequest): string {
  const searchableText = [
    request.articleTitle,
    request.abstractText,
    request.fullTextSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const productName = request.productName?.toLowerCase();

  const hasCompanySuspectProduct =
    Boolean(productName) && searchableText.includes(productName as string);

  const detectedEvents = extractDetectedEvents(searchableText);
  const specialSituations = extractSpecialSituations(searchableText);
  const seriousnessCriteria = extractSeriousnessCriteria(searchableText);

  const patientSignals = [
    "patient",
    "male",
    "female",
    "woman",
    "man",
    "adult",
    "child",
    "year-old",
    "years old",
  ];

  const reporterSignals = ["author", "reported", "case report", "correspondence"];

  const hasIdentifiablePatient = containsAny(searchableText, patientSignals);
  const hasIdentifiableReporter = containsAny(searchableText, reporterSignals);
  const hasAdverseEvent = detectedEvents.length > 0;

  const isValidCase =
    hasIdentifiablePatient &&
    hasIdentifiableReporter &&
    hasCompanySuspectProduct &&
    hasAdverseEvent;

  return JSON.stringify({
    validity: {
      isValidCase,
      hasIdentifiablePatient,
      hasIdentifiableReporter,
      hasCompanySuspectProduct,
      hasAdverseEvent,
      reasoning: isValidCase
        ? [
            "Minimum validity criteria appear to be present.",
            "Company suspect product and adverse event were detected.",
          ]
        : [
            "One or more minimum validity criteria were not confidently detected.",
            "Manual review is recommended before final decision.",
          ],
    },
    patient: {
      identifiers: hasIdentifiablePatient ? ["patient signal detected"] : [],
      age: searchableText.includes("year-old") ? "mentioned" : undefined,
      sex: searchableText.includes("female")
        ? "female"
        : searchableText.includes("male")
          ? "male"
          : undefined,
      country: request.country,
    },
    reporter: {
      primaryReporter: hasIdentifiableReporter ? "literature author" : undefined,
      reporterType: hasIdentifiableReporter ? "literature_author" : undefined,
      country: request.country,
    },
    products: {
      companySuspects:
        hasCompanySuspectProduct && request.productName ? [request.productName] : [],
      coSuspects: [],
      concomitants: [],
      treatmentProducts: [],
    },
    events: {
      adverseEvents: detectedEvents,
      seriousnessCriteria,
      isSerious: seriousnessCriteria.length > 0,
    },
    specialSituations,
    countryOfInterest: {
      country: request.country,
      isCOI: Boolean(request.country),
      reasoning: request.country
        ? "Country was supplied in the screening request."
        : "Country was not available for COI confirmation.",
    },
    classification: isValidCase
      ? "valid_case"
      : specialSituations.length > 0
        ? "special_situation_only"
        : "needs_manual_review",
    confidence: isValidCase ? 0.84 : 0.42,
    reviewerNotes: isValidCase
      ? ["AI recommends moving this article to intake."]
      : ["AI recommends manual review due to incomplete validity evidence."],
    recommendedNextStep: isValidCase ? "send_to_intake" : "manual_review",
  });
}

export class ScreeningAgent {
  async evaluate(
    request: ScreeningAgentRequest,
  ): Promise<ScreeningAgentResponse> {
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
      topK: 10,
      minScore: 0,
    });

    const prompt = buildScreeningPrompt({
      tenantId: request.tenantId,
      articleId: request.articleId,
      articleTitle: request.articleTitle,
      abstractText: request.abstractText,
      fullTextSnippet: request.fullTextSnippet,
      productName: request.productName,
      country: request.country,
      ragContext: ragResponse.context,
    });

    const rawAIResponse = mockScreeningLLMResponse(request);
    const result = validateScreeningAIResult(rawAIResponse);

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

export const screeningAgent = new ScreeningAgent();