import type { CaseAssistSuggestion, CaseDraftPayload } from "./case-processing-types";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildNarrativeDraft(draft: CaseDraftPayload): string {
  const patientBits = [
    draft.patient.ageValue !== undefined
      ? `${draft.patient.ageValue} ${draft.patient.ageUnit ?? ""}`.trim()
      : "",
    draft.patient.sex ? draft.patient.sex.toLowerCase() : "",
  ].filter(Boolean);

  const products = draft.products
    .filter((item) =>
      ["SUSPECT", "INTERACTING"].includes(item.roleCharacterization),
    )
    .map((item) => item.reportedName)
    .filter(Boolean);

  const events = draft.events.map((item) => item.reportedTerm).filter(Boolean);

  const sentences = [
    patientBits.length
      ? `The report concerns a ${patientBits.join(" ")} patient.`
      : "The report concerns an identifiable patient.",
    products.length
      ? `The reported suspect/interacting product(s) were ${products.join(", ")}.`
      : "The suspect product requires confirmation.",
    events.length
      ? `The reported event(s) were ${events.join(", ")}.`
      : "The adverse event/reaction requires confirmation.",
  ];

  const datedEvents = draft.events
    .filter((item) => item.onsetDate)
    .map((item) => `${item.reportedTerm} onset ${item.onsetDate}`);
  if (datedEvents.length) {
    sentences.push(`Reported chronology: ${datedEvents.join("; ")}.`);
  }

  return sentences.join(" ");
}

export function evaluateCaseAssist(
  draft: CaseDraftPayload,
): CaseAssistSuggestion[] {
  const suggestions: CaseAssistSuggestion[] = [];

  const missing: string[] = [];
  if (!draft.reporters.length) missing.push("Reporter");
  if (!draft.products.length) missing.push("Product");
  if (!draft.events.length) missing.push("Adverse event/reaction");
  if (!draft.identification.countryCode) missing.push("Country");
  if (!draft.events.some((item) => item.onsetDate)) {
    missing.push("Event onset date");
  }
  if (!draft.reporters.some((item) => item.countryCode)) {
    missing.push("Reporter country");
  }

  if (missing.length) {
    suggestions.push({
      suggestionType: "MISSING_INFORMATION",
      payload: {
        status: "REVIEW_REQUIRED",
        missingItems: missing,
      },
      confidence: 1,
      evidence: {
        basis: "Deterministic completeness check against current case draft.",
      },
    });
  }

  const seriousEvents = draft.events.filter((item) => item.seriousness === true);
  suggestions.push({
    suggestionType: "SERIOUSNESS_SUPPORT",
    payload: {
      recommendation:
        seriousEvents.length > 0
          ? "SERIOUS"
          : draft.events.every((item) => item.seriousness === false)
            ? "NON_SERIOUS"
            : "UNRESOLVED",
      seriousEvents: seriousEvents.map((item) => ({
        eventKey: item.eventKey,
        reportedTerm: item.reportedTerm,
        criteria: item.seriousnessCriteria ?? {},
      })),
    },
    confidence: seriousEvents.length ? 0.95 : 0.7,
    evidence: {
      basis: "Current event seriousness flags and seriousness criteria.",
    },
  });

  const uncodedEvents = draft.events.filter(
    (item) => !text(item.meddraCode) || !text(item.meddraVersion),
  );
  if (uncodedEvents.length) {
    suggestions.push({
      suggestionType: "CODING_REVIEW",
      payload: {
        status: "LICENSED_DICTIONARY_REQUIRED",
        events: uncodedEvents.map((item) => ({
          eventKey: item.eventKey,
          reportedTerm: item.reportedTerm,
        })),
        recommendation:
          "Retain the verbatim reported term until an authorised MedDRA coding source is connected.",
      },
      confidence: 1,
      evidence: {
        proprietaryDictionaryUsed: false,
      },
    });
  }

  suggestions.push({
    suggestionType: "CAUSALITY_SUPPORT",
    payload: {
      recommendation: "HUMAN_ASSESSMENT_REQUIRED",
      productEventPairs: draft.products.flatMap((product) =>
        draft.events.map((event) => ({
          productKey: product.productKey,
          eventKey: event.eventKey,
        })),
      ),
    },
    confidence: 1,
    evidence: {
      basis:
        "Nexus does not autonomously determine medical causality; source evidence should support the assessor decision.",
    },
  });

  suggestions.push({
    suggestionType: "EXPECTEDNESS_SUPPORT",
    payload: {
      recommendation: "LABEL_OR_RSI_REVIEW_REQUIRED",
      productEventPairs: draft.products.flatMap((product) =>
        draft.events.map((event) => ({
          productKey: product.productKey,
          eventKey: event.eventKey,
        })),
      ),
    },
    confidence: 1,
    evidence: {
      basis:
        "Expectedness/listedness requires the applicable controlled label or RSI context.",
    },
  });

  suggestions.push({
    suggestionType: "NARRATIVE_DRAFT",
    payload: {
      narrative: buildNarrativeDraft(draft),
      generationMode: "DETERMINISTIC_STRUCTURED_FACTS",
    },
    confidence: 0.8,
    evidence: {
      patientKey: draft.patient.patientKey,
      productKeys: draft.products.map((item) => item.productKey),
      eventKeys: draft.events.map((item) => item.eventKey),
    },
  });

  return suggestions;
}

export function deterministicNarrativeDraft(
  draft: CaseDraftPayload,
): string {
  return buildNarrativeDraft(draft);
}
