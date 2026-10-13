import "server-only";

import { recordAIAudit } from "@/lib/ai/ai-audit";
import { recordAIMetric } from "@/lib/ai/ai-metrics";
import { aiProviderFactory } from "@/lib/ai/provider-factory";
import { createAIRequestId } from "@/lib/ai/ai-runtime";
import {
  governPatientExtraction,
  normalizedArticleSource,
} from "@/lib/literature/review/patient-extraction-governance";
import type {
  PatientEvidenceLocation,
  PatientExtractionClassification,
  PatientExtractionEntity,
  PatientExtractionResult,
  PatientExtractionSuggestion,
  SourceLinkedEvidence,
} from "@/lib/literature/review/patient-extraction-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function evidence(value: unknown): SourceLinkedEvidence {
  if (!isRecord(value)) {
    return { location: "ABSTRACT", quote: "" };
  }
  const location: PatientEvidenceLocation =
    value.location === "TITLE" ? "TITLE" : "ABSTRACT";
  return {
    location,
    quote: text(value.quote),
  };
}

function entities(value: unknown): PatientExtractionEntity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = text(item.name);
    if (!name) return [];
    return [{ name, evidence: evidence(item.evidence) }];
  });
}

function patient(value: unknown, index: number): PatientExtractionSuggestion | null {
  if (!isRecord(value)) return null;
  const suggestionKey = text(value.suggestionKey) || "P" + (index + 1);
  const identifiablePatientStatus =
    value.identifiablePatientStatus === "PRESENT"
      ? "PRESENT"
      : value.identifiablePatientStatus === "ABSENT"
        ? "ABSENT"
        : "UNRESOLVED";

  return {
    suggestionKey,
    patientLabel: text(value.patientLabel) || "Patient " + (index + 1),
    identifiablePatientStatus,
    patientEvidence: evidence(value.patientEvidence),
    age: text(value.age) || undefined,
    ageEvidence: isRecord(value.ageEvidence) ? evidence(value.ageEvidence) : undefined,
    sex: text(value.sex) || undefined,
    sexEvidence: isRecord(value.sexEvidence) ? evidence(value.sexEvidence) : undefined,
    country: text(value.country) || undefined,
    countryEvidence: isRecord(value.countryEvidence)
      ? evidence(value.countryEvidence)
      : undefined,
    products: entities(value.products),
    events: entities(value.events),
  };
}

function parse(content: string): PatientExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Patient extraction AI returned invalid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new Error("Patient extraction AI response must be a JSON object.");
  }

  const classification: PatientExtractionClassification =
    parsed.classification === "SINGLE_PATIENT" ||
    parsed.classification === "MULTIPLE_PATIENTS" ||
    parsed.classification === "NO_PATIENT"
      ? parsed.classification
      : "UNRESOLVED";

  const patients = Array.isArray(parsed.patients)
    ? parsed.patients
        .map((value, index) => patient(value, index))
        .filter((value): value is PatientExtractionSuggestion => Boolean(value))
    : [];

  return {
    classification,
    confidence: Number(parsed.confidence) || 0,
    rationale: text(parsed.rationale),
    patients,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.map(text).filter(Boolean)
      : [],
    sourceGovernanceCorrections: [],
  };
}

function prompt(input: {
  title: string;
  abstractText: string;
  screeningContext?: Record<string, unknown>;
}): string {
  return [
    "You are the ClinixAI Pharmacovigilance Literature Review Patient Extraction Agent.",
    "",
    "Your only task is to PROPOSE patient/case segments from the supplied article source. These are suggestions for a human reviewer, never final governed patient records.",
    "",
    "Use ONLY the supplied TITLE and ABSTRACT as source evidence.",
    "Do not use external knowledge.",
    "Do not invent a patient, product, event, age, sex, country, diagnosis, relationship, causality, or chronology.",
    "",
    "Mandatory source-linking rules:",
    "1. Every patient suggestion must include a short verbatim quote from TITLE or ABSTRACT that proves that patient/case exists.",
    "2. Every extracted product and event must include its own short verbatim quote from TITLE or ABSTRACT.",
    "3. Age and sex may be returned only when directly supported by a quote.",
    "4. Country may be returned only when the quote establishes the location where the patient/event occurred, was treated, admitted, presented, developed, or was hospitalized.",
    "5. Nationality, ethnicity, residence, affiliation, journal, author location, or a demonym such as \"Indian female\" does NOT establish Country of Incidence.",
    "6. Do not merge clearly distinct patients.",
    "7. Do not split one patient into multiple patients unless the article clearly describes distinct cases.",
    "8. For case series where individual patient details cannot be separated, choose UNRESOLVED and explain why.",
    "9. Products and events belong to the suggested patient only when the article text supports that patient-level association. If not separable, omit the entity from that patient.",
    "10. Do not perform expectedness, causality, company applicability, seriousness, or reportability decisions here.",
    "",
    "The Screening context below is a HINT ONLY. It is not source evidence and must never be quoted or used to invent data:",
    JSON.stringify(input.screeningContext || {}, null, 2),
    "",
    "Return ONE JSON object only:",
    JSON.stringify({
      classification: "SINGLE_PATIENT | MULTIPLE_PATIENTS | NO_PATIENT | UNRESOLVED",
      confidence: "0-100",
      rationale: "short explanation",
      patients: [
        {
          suggestionKey: "P1",
          patientLabel: "Patient 1",
          identifiablePatientStatus: "PRESENT | ABSENT | UNRESOLVED",
          patientEvidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" },
          age: "optional source-supported age or age group",
          ageEvidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" },
          sex: "optional source-supported sex",
          sexEvidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" },
          country: "optional direct event/patient location only",
          countryEvidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" },
          products: [
            {
              name: "source-supported product",
              evidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" }
            }
          ],
          events: [
            {
              name: "source-supported event",
              evidence: { location: "TITLE | ABSTRACT", quote: "verbatim source quote" }
            }
          ]
        }
      ],
      warnings: ["ambiguity or limitation"]
    }, null, 2),
    "",
    "TITLE:",
    input.title,
    "",
    "ABSTRACT:",
    input.abstractText
  ].join("\n");
}

export interface PatientExtractionAgentInput {
  tenantId: string;
  correlationId?: string;
  pmid?: string;
  article: {
    title: string;
    abstractText: string;
  };
  screeningContext?: Record<string, unknown>;
}

export interface PatientExtractionAgentOutput {
  result: PatientExtractionResult;
  source: {
    title: string;
    abstractText: string;
  };
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

export async function extractPatientSuggestions(
  input: PatientExtractionAgentInput,
): Promise<PatientExtractionAgentOutput> {
  const requestId = createAIRequestId("review-patient-extraction");
  const source = normalizedArticleSource(input.article);

  try {
    const provider = aiProviderFactory.getProvider();
    const completion = await provider.complete({
      systemPrompt:
        "You are a governed PV literature patient-extraction assistant. Return strict JSON only. Every extracted fact must be supported by the supplied source text.",
      userPrompt: prompt({
        title: source.title,
        abstractText: source.abstractText,
        screeningContext: input.screeningContext,
      }),
      responseFormat: "json",
      temperature: 0,
      requestId,
    });

    const raw = parse(completion.content);
    const governed = governPatientExtraction({
      raw,
      title: source.title,
      abstractText: source.abstractText,
    });

    recordAIMetric({
      operation: "review_patient_extraction",
      provider: completion.provider,
      model: completion.model,
      success: true,
      latencyMs: completion.latencyMs,
      attempts: completion.attempts,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
      totalTokens: completion.totalTokens,
      requestId: completion.requestId,
      correlationId: input.correlationId,
    });

    await recordAIAudit({
      operation: "review_patient_extraction",
      status: "SUCCESS",
      tenantId: input.tenantId,
      pmid: input.pmid,
      provider: completion.provider,
      model: completion.model,
      requestId: completion.requestId,
      correlationId: input.correlationId,
      attempts: completion.attempts,
      latencyMs: completion.latencyMs,
      decision: governed.classification,
      confidence: governed.confidence,
      metadata: {
        suggestedPatientCount: governed.patients.length,
        warnings: governed.warnings,
        sourceGovernanceCorrections: governed.sourceGovernanceCorrections,
      },
    });

    return {
      result: governed,
      source,
      aiExecution: {
        provider: completion.provider,
        model: completion.model,
        requestId: completion.requestId,
        correlationId: input.correlationId,
        attempts: completion.attempts,
        latencyMs: completion.latencyMs,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
      },
    };
  } catch (error) {
    await recordAIAudit({
      operation: "review_patient_extraction",
      status: "FAILED",
      tenantId: input.tenantId,
      pmid: input.pmid,
      requestId,
      correlationId: input.correlationId,
      errorMessage:
        error instanceof Error ? error.message : "Unknown patient extraction error.",
      metadata: {},
    });
    throw error;
  }
}
