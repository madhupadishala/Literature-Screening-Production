import type {
  PatientExtractionResult,
  PatientExtractionSuggestion,
  SourceLinkedEvidence,
} from "@/lib/literature/review/patient-extraction-types";

function normalize(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string): string {
  return normalize(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function sourceText(input: {
  title: string;
  abstractText: string;
  location: SourceLinkedEvidence["location"];
}): string {
  return input.location === "TITLE"
    ? normalize(input.title)
    : stripHtml(input.abstractText);
}

function quoteExists(input: {
  title: string;
  abstractText: string;
  evidence?: SourceLinkedEvidence;
}): boolean {
  if (!input.evidence?.quote?.trim()) return false;
  const source = sourceText({
    title: input.title,
    abstractText: input.abstractText,
    location: input.evidence.location,
  }).toLowerCase();
  const quote = normalize(input.evidence.quote).toLowerCase();
  return Boolean(quote && source.includes(quote));
}

function sanitizeEvidence(input: {
  title: string;
  abstractText: string;
  evidence?: SourceLinkedEvidence;
}): SourceLinkedEvidence | undefined {
  return quoteExists(input) && input.evidence
    ? {
        location: input.evidence.location,
        quote: normalize(input.evidence.quote),
      }
    : undefined;
}

function locationCountryEvidence(quote: string, country: string): boolean {
  const text = normalize(quote).toLowerCase();
  const normalizedCountry = normalize(country).toLowerCase();
  if (!text.includes(normalizedCountry)) return false;

  const locationCue =
    /\b(?:in|at|within|hospitali[sz]ed in|admitted in|treated in|presented in|occurred in|developed in)\b/i;
  const patientOrEvent =
    /\b(?:patient|case|event|reaction|adverse|hospital|clinic|department|treated|presented|developed|occurred|admitted)\b/i;
  return locationCue.test(text) && patientOrEvent.test(text);
}

function governPatient(input: {
  suggestion: PatientExtractionSuggestion;
  title: string;
  abstractText: string;
  corrections: string[];
}): PatientExtractionSuggestion | null {
  const patientEvidence = sanitizeEvidence({
    title: input.title,
    abstractText: input.abstractText,
    evidence: input.suggestion.patientEvidence,
  });

  if (!patientEvidence) {
    input.corrections.push(
      `${input.suggestion.suggestionKey}: patient suggestion removed because its patient evidence is not present in the supplied article source.`,
    );
    return null;
  }

  const products = input.suggestion.products.flatMap((product) => {
    const evidence = sanitizeEvidence({
      title: input.title,
      abstractText: input.abstractText,
      evidence: product.evidence,
    });
    if (!evidence) {
      input.corrections.push(
        `${input.suggestion.suggestionKey}: product "${product.name}" removed because the cited source quote was not found.`,
      );
      return [];
    }
    return [{ name: normalize(product.name), evidence }];
  });

  const events = input.suggestion.events.flatMap((event) => {
    const evidence = sanitizeEvidence({
      title: input.title,
      abstractText: input.abstractText,
      evidence: event.evidence,
    });
    if (!evidence) {
      input.corrections.push(
        `${input.suggestion.suggestionKey}: event "${event.name}" removed because the cited source quote was not found.`,
      );
      return [];
    }
    return [{ name: normalize(event.name), evidence }];
  });

  const ageEvidence = sanitizeEvidence({
    title: input.title,
    abstractText: input.abstractText,
    evidence: input.suggestion.ageEvidence,
  });
  const sexEvidence = sanitizeEvidence({
    title: input.title,
    abstractText: input.abstractText,
    evidence: input.suggestion.sexEvidence,
  });
  const countryEvidence = sanitizeEvidence({
    title: input.title,
    abstractText: input.abstractText,
    evidence: input.suggestion.countryEvidence,
  });

  const age = input.suggestion.age && ageEvidence
    ? normalize(input.suggestion.age)
    : undefined;
  const sex = input.suggestion.sex && sexEvidence
    ? normalize(input.suggestion.sex)
    : undefined;

  let country: string | undefined;
  let governedCountryEvidence: SourceLinkedEvidence | undefined;
  if (
    input.suggestion.country &&
    countryEvidence &&
    locationCountryEvidence(countryEvidence.quote, input.suggestion.country)
  ) {
    country = normalize(input.suggestion.country);
    governedCountryEvidence = countryEvidence;
  } else if (input.suggestion.country) {
    input.corrections.push(
      `${input.suggestion.suggestionKey}: country "${input.suggestion.country}" removed because nationality/demonym/residence wording alone does not establish event location.`,
    );
  }

  return {
    suggestionKey: normalize(input.suggestion.suggestionKey),
    patientLabel: normalize(input.suggestion.patientLabel || input.suggestion.suggestionKey),
    identifiablePatientStatus:
      input.suggestion.identifiablePatientStatus === "PRESENT"
        ? "PRESENT"
        : input.suggestion.identifiablePatientStatus === "ABSENT"
          ? "ABSENT"
          : "UNRESOLVED",
    patientEvidence,
    age,
    ageEvidence: age ? ageEvidence : undefined,
    sex,
    sexEvidence: sex ? sexEvidence : undefined,
    country,
    countryEvidence: governedCountryEvidence,
    products,
    events,
  };
}

export function governPatientExtraction(input: {
  raw: PatientExtractionResult;
  title: string;
  abstractText: string;
}): PatientExtractionResult {
  const corrections: string[] = [];
  const patients = input.raw.patients.flatMap((suggestion) => {
    const governed = governPatient({
      suggestion,
      title: input.title,
      abstractText: input.abstractText,
      corrections,
    });
    return governed ? [governed] : [];
  });

  const classification =
    patients.length === 0
      ? input.raw.classification === "NO_PATIENT"
        ? "NO_PATIENT"
        : "UNRESOLVED"
      : patients.length === 1
        ? "SINGLE_PATIENT"
        : "MULTIPLE_PATIENTS";

  return {
    classification,
    confidence: Math.max(0, Math.min(100, Number(input.raw.confidence) || 0)),
    rationale: normalize(input.raw.rationale || ""),
    patients,
    warnings: Array.isArray(input.raw.warnings)
      ? input.raw.warnings.map(normalize).filter(Boolean)
      : [],
    sourceGovernanceCorrections: corrections,
  };
}

export function normalizedArticleSource(input: {
  title: string;
  abstractText: string;
}): { title: string; abstractText: string } {
  return {
    title: normalize(input.title),
    abstractText: stripHtml(input.abstractText),
  };
}
