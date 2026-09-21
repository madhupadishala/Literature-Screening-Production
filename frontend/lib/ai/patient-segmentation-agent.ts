import type { PatientSegment } from "@/lib/literature/review/review-types";

import { recordAIAudit } from "./ai-audit";
import { recordAIMetric } from "./ai-metrics";
import { aiProviderFactory } from "./provider-factory";
import { createAIRequestId } from "./ai-runtime";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function parseSegment(value: unknown, index: number): PatientSegment {
  if (!isRecord(value)) throw new Error("Invalid patient segmentation response.");

  const relationships = Array.isArray(value.relationships)
    ? value.relationships
        .filter(isRecord)
        .map((item) => {
          const product = asString(item.product);
          const event = asString(item.event);
          const evidence = asString(item.evidence);
          const role = asString(item.role).toUpperCase();
          if (!product || !event || !evidence) {
            throw new Error("Each product-event relationship requires product, event and evidence.");
          }
          if (!["SUSPECT", "INTERACTING", "CONCOMITANT", "UNKNOWN"].includes(role)) {
            throw new Error("Invalid product role in patient segmentation.");
          }
          return {
            product,
            event,
            evidence,
            role: role as PatientSegment["relationships"][number]["role"],
          };
        })
    : [];

  const identifiablePatient = asString(value.identifiablePatient).toUpperCase();
  if (!["PRESENT", "ABSENT", "UNRESOLVED"].includes(identifiablePatient)) {
    throw new Error("Invalid identifiablePatient value.");
  }

  const age =
    typeof value.age === "number" && Number.isFinite(value.age) && value.age >= 0
      ? value.age
      : undefined;
  const ageUnitRaw = asString(value.ageUnit).toLowerCase();
  const ageUnit =
    ["years", "months", "days"].includes(ageUnitRaw)
      ? (ageUnitRaw as "years" | "months" | "days")
      : undefined;
  const sexRaw = asString(value.sex).toLowerCase();
  const sex =
    ["female", "male", "other", "unknown"].includes(sexRaw)
      ? (sexRaw as "female" | "male" | "other" | "unknown")
      : "unknown";

  return {
    segmentKey: asString(value.segmentKey) || `PATIENT-${index + 1}`,
    patientDescriptor:
      asString(value.patientDescriptor) || `Patient ${index + 1}`,
    identifiablePatient:
      identifiablePatient as PatientSegment["identifiablePatient"],
    age,
    ageUnit,
    sex,
    products: stringArray(value.products),
    events: stringArray(value.events),
    relationships,
    sourceEvidence: stringArray(value.sourceEvidence),
    confidence:
      typeof value.confidence === "number"
        ? Math.max(0, Math.min(100, value.confidence))
        : undefined,
  };
}

function parseResponse(content: string): PatientSegment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Patient segmentation AI returned invalid JSON.");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.patients)) {
    throw new Error("Patient segmentation AI response must contain a patients array.");
  }
  if (parsed.patients.length > 25) {
    throw new Error("Patient segmentation AI returned too many patient segments.");
  }
  return parsed.patients.map(parseSegment);
}

export async function draftPatientSegmentation(input: {
  tenantId: string;
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  screeningProducts: string[];
  screeningEvents: string[];
  correlationId?: string;
}): Promise<{
  segments: PatientSegment[];
  aiExecution: {
    provider: string;
    model: string;
    requestId: string;
    attempts: number;
    latencyMs: number;
  };
}> {
  const requestId = createAIRequestId("review-segmentation");
  const provider = aiProviderFactory.getProvider();

  const prompt = [
    "Segment the literature article into distinct patient/case records for pharmacovigilance Review.",
    "This is a draft extraction only. Do not make the final reportability, expectedness, causality, company applicability, seriousness, or intake decision.",
    "Use only the supplied article evidence. Do not invent a patient, age, sex, product-event relationship, location, chronology, or clinical fact.",
    "If the article describes zero individual patients, return an empty patients array.",
    "If the same patient has multiple products/events, keep them in one patient segment.",
    "If multiple distinct patients are described, create separate patient segments.",
    "For each product-event pair, classify the product role only as SUSPECT, INTERACTING, CONCOMITANT, or UNKNOWN.",
    "Do not infer Country of Incidence from nationality, affiliation, journal, or author address.",
    "Return JSON only in this shape:",
    '{"patients":[{"segmentKey":"PATIENT-1","patientDescriptor":"...","identifiablePatient":"PRESENT|ABSENT|UNRESOLVED","age":29,"ageUnit":"years","sex":"female|male|other|unknown","products":["..."],"events":["..."],"relationships":[{"product":"...","event":"...","role":"SUSPECT|INTERACTING|CONCOMITANT|UNKNOWN","evidence":"source-supported phrase"}],"sourceEvidence":["..."],"confidence":0}]}',
    "",
    `PMID: ${input.pmid}`,
    `Title: ${input.title}`,
    `Authors: ${input.authors.join(", ")}`,
    `Screening products (context only): ${input.screeningProducts.join(", ") || "none"}`,
    `Screening events (context only): ${input.screeningEvents.join(", ") || "none"}`,
    "Article text:",
    input.abstract,
  ].join("\n");

  try {
    const completion = await provider.complete({
      systemPrompt:
        "You are a pharmacovigilance literature case-segmentation assistant. Extract conservatively and return one valid JSON object only.",
      userPrompt: prompt,
      responseFormat: "json",
      requestId,
      temperature: 0,
    });
    const segments = parseResponse(completion.content);

    recordAIMetric({
      operation: "review_segmentation",
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
      operation: "review_segmentation",
      status: "SUCCESS",
      tenantId: input.tenantId,
      pmid: input.pmid,
      provider: completion.provider,
      model: completion.model,
      requestId: completion.requestId,
      correlationId: input.correlationId,
      attempts: completion.attempts,
      latencyMs: completion.latencyMs,
      metadata: {
        patientSegmentCount: segments.length,
        segments,
        draftOnly: true,
      },
    });

    return {
      segments,
      aiExecution: {
        provider: completion.provider,
        model: completion.model,
        requestId: completion.requestId,
        attempts: completion.attempts,
        latencyMs: completion.latencyMs,
      },
    };
  } catch (error) {
    await recordAIAudit({
      operation: "review_segmentation",
      status: "FAILED",
      tenantId: input.tenantId,
      pmid: input.pmid,
      requestId,
      correlationId: input.correlationId,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Unknown patient segmentation AI error.",
      metadata: { draftOnly: true },
    });
    throw error;
  }
}
