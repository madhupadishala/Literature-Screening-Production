import type {
  ListednessAssessment,
  ListednessAssessmentInput,
  ListednessCaseContext,
  ListednessEvidenceDecision,
  ListednessLabelEvidence,
  ListednessMatchType,
} from "./types";

const UK_US_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\boedema\\b/g, "edema"],
  [/\\bhaemorrhage\\b/g, "hemorrhage"],
  [/\\bhaemoglobin\\b/g, "hemoglobin"],
  [/\\banaemia\\b/g, "anemia"],
  [/\\btumour\\b/g, "tumor"],
  [/\\bfoetal\\b/g, "fetal"],
  [/\\bdiarrhoea\\b/g, "diarrhea"],
  [/\\bdyspnoea\\b/g, "dyspnea"],
  [/\\boesophag/g, "esophag"],
  [/\\bleukaemia\\b/g, "leukemia"],
  [/\\bpaediatric\\b/g, "pediatric"],
];

const CONTROLLED_SYNONYM_GROUPS: string[][] = [
  ["pyrexia", "fever"],
  ["vomiting", "emesis"],
  ["pruritus", "itching"],
  ["dyspnea", "shortness of breath", "breathlessness"],
  ["urticaria", "hives"],
  ["hyperbilirubinemia", "hyperbilirubinaemia", "blood bilirubin increased", "bilirubin increased"],
  ["thrombocytopenia", "platelet count decreased", "platelets decreased"],
  ["alanine aminotransferase increased", "alt increased", "alt elevation", "elevated alt"],
  ["aspartate aminotransferase increased", "ast increased", "ast elevation", "elevated ast"],
  ["hemoglobin decreased", "decreased hemoglobin", "low hemoglobin"],
  ["blood creatinine increased", "creatinine increased", "elevated creatinine"],
  ["neutrophil count decreased", "neutropenia"],
];

const RESTRICTIVE_QUALIFIERS = [
  "severe",
  "serious",
  "life threatening",
  "life-threatening",
  "fatal",
  "persistent",
  "clinically significant",
  "grade 3",
  "grade 4",
];

const NON_ADR_SECTIONS = [
  "indication",
  "indications",
  "clinical studies",
  "clinical efficacy",
];

function normalize(value: unknown): string {
  let text = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[®™]/g, "");
  for (const [pattern, replacement] of UK_US_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9><=×x.%+/-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function compact(value: unknown): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function synonymCanonical(term: string): string {
  const normalized = compact(term);
  for (const group of CONTROLLED_SYNONYM_GROUPS) {
    const canonicalGroup = group.map(compact);
    if (canonicalGroup.some((candidate) => candidate === normalized)) {
      return canonicalGroup[0];
    }
  }
  return normalized;
}

function stripCaseQualifiers(term: string): string {
  let normalized = normalize(term);
  for (const qualifier of RESTRICTIVE_QUALIFIERS) {
    const q = normalize(qualifier);
    if (normalized === q) return "";
    if (normalized.startsWith(q + " ")) {
      normalized = normalized.slice(q.length).trim();
      break;
    }
  }
  return normalized.trim();
}

function eventAliases(event: string): string[] {
  const original = normalize(event);
  const base = stripCaseQualifiers(event);
  const aliases = new Set<string>([original, base, synonymCanonical(original), synonymCanonical(base)]);
  for (const group of CONTROLLED_SYNONYM_GROUPS) {
    const normalizedGroup = group.map(normalize);
    if (
      normalizedGroup.includes(original) ||
      normalizedGroup.includes(base) ||
      normalizedGroup.includes(synonymCanonical(original)) ||
      normalizedGroup.includes(synonymCanonical(base))
    ) {
      normalizedGroup.forEach((item) => aliases.add(item));
    }
  }
  return [...aliases].filter(Boolean);
}

function containsConcept(text: string, event: string): { matched: boolean; matchType: ListednessMatchType } {
  const rawEvent = String(event ?? "").trim();
  const normalizedText = normalize(text);
  const normalizedEvent = normalize(rawEvent);
  const stripped = stripCaseQualifiers(rawEvent);
  if (normalizedText.includes(normalizedEvent)) {
    return { matched: true, matchType: "EXACT" };
  }
  const aliases = eventAliases(rawEvent);
  for (const alias of aliases) {
    if (alias && normalizedText.includes(alias)) {
      const canonicalEvent = synonymCanonical(stripped);
      const canonicalAlias = synonymCanonical(alias);
      if (canonicalEvent === canonicalAlias && alias !== normalize(stripped)) {
        return { matched: true, matchType: "SYNONYM" };
      }
      if (alias === normalize(stripped) && normalize(rawEvent) !== normalize(stripped)) {
        return { matched: true, matchType: "CASE_NARROWER_THAN_LABEL" };
      }
      return { matched: true, matchType: "NORMALIZED_TEXT" };
    }
  }
  return { matched: false, matchType: "NO_MATCH" };
}

function sentenceContaining(text: string, event: string): string {
  const aliases = eventAliases(event);
  const sentences = String(text).split(/(?<=[.!?;])\\s+|\\n+/);
  for (const sentence of sentences) {
    const normalized = normalize(sentence);
    if (aliases.some((alias) => alias && normalized.includes(alias))) return sentence;
  }
  return text;
}

function hasNegation(sentence: string): boolean {
  const text = normalize(sentence);
  return /\\b(no cases?|not associated|not observed|not reported|has not been reported|have not been reported|without evidence of|did not occur|none reported)\\b/.test(text);
}

function classEffectOnly(sentence: string): boolean {
  const text = normalize(sentence);
  return /\\b(other drugs? in (?:this|the) class|other agents? in (?:this|the) class|class effect|drugs? of this class)\\b/.test(text) &&
    !/\\bincluding (?:this|the) product\\b/.test(text);
}

function otherProductOnly(sentence: string): boolean {
  const text = normalize(sentence);
  return /\\b(comparator|control drug|other product|drug y|placebo)\\b/.test(text) &&
    !/\\b(?:this|the subject) product\\b/.test(text);
}

function indicationOnly(section: string | undefined, sentence: string): boolean {
  const normalizedSection = normalize(section);
  if (NON_ADR_SECTIONS.some((candidate) => normalizedSection.includes(candidate))) return true;
  const text = normalize(sentence);
  return /\\b(indicated for|used for the treatment of|treatment of|approved for)\\b/.test(text) &&
    !/\\b(adverse|reaction|side effect|undesirable|reported)\\b/.test(text);
}

function labelRestrictiveQualifier(sentence: string, reportedEvent: string): string | null {
  const text = normalize(sentence);
  const reported = normalize(reportedEvent);
  for (const qualifier of RESTRICTIVE_QUALIFIERS) {
    const q = normalize(qualifier);
    if (text.includes(q) && !reported.includes(q)) return qualifier;
  }
  return null;
}

function thresholdFromSentence(sentence: string): number | null {
  const text = normalize(sentence);
  const match = text.match(/(?:>|greater than|more than)\\s*(\\d+(?:\\.\\d+)?)\\s*[x×]?\\s*uln/);
  if (match) return Number(match[1]);
  return null;
}

function caseUlnRatio(input: ListednessAssessmentInput): number | null {
  const ctx = input.labContext;
  if (!ctx) return null;
  if (typeof ctx.ulnRatio === "number" && Number.isFinite(ctx.ulnRatio)) return ctx.ulnRatio;
  if (
    typeof ctx.value === "number" &&
    typeof ctx.uln === "number" &&
    Number.isFinite(ctx.value) &&
    Number.isFinite(ctx.uln) &&
    ctx.uln > 0
  ) {
    return ctx.value / ctx.uln;
  }
  return null;
}

function conditionDecision(
  sentence: string,
  context: ListednessCaseContext | undefined,
): { status: "PASS" | "FAIL" | "UNRESOLVED"; condition?: string } {
  const text = normalize(sentence);
  const checks: Array<{ key: keyof ListednessCaseContext; terms: string[]; name: string }> = [
    { key: "milkExposure", terms: ["with milk", "administered with milk", "taken with milk"], name: "milk" },
    { key: "foodExposure", terms: ["with food", "administered with food", "taken with food"], name: "food" },
    { key: "grapefruitExposure", terms: ["grapefruit"], name: "grapefruit" },
    { key: "alcoholExposure", terms: ["with alcohol", "alcohol consumption", "alcohol use"], name: "alcohol" },
  ];
  for (const check of checks) {
    if (!check.terms.some((term) => text.includes(normalize(term)))) continue;
    const value = context?.[check.key];
    if (value === true) return { status: "PASS", condition: check.name };
    if (value === false) return { status: "FAIL", condition: check.name };
    const co = (context?.coExposures || []).map(normalize);
    const denied = (context?.deniedCoExposures || []).map(normalize);
    if (co.includes(check.name)) return { status: "PASS", condition: check.name };
    if (denied.includes(check.name)) return { status: "FAIL", condition: check.name };
    return { status: "UNRESOLVED", condition: check.name };
  }
  return { status: "PASS" };
}

function isLabEvent(input: ListednessAssessmentInput): boolean {
  if (input.eventKind === "LAB") return true;
  const event = normalize(input.reportedEvent);
  return /\\b(increased|decreased|elevation|elevated|reduced|count|aminotransferase|bilirubin|hemoglobin|creatinine|platelet|neutrophil)\\b/.test(event);
}

function evidenceDecision(
  input: ListednessAssessmentInput,
  evidence: ListednessLabelEvidence,
): ListednessEvidenceDecision {
  const concept = containsConcept(evidence.text, input.reportedEvent);
  const sentence = sentenceContaining(evidence.text, input.reportedEvent);

  if (!concept.matched) {
    return {
      evidence,
      conceptMatched: false,
      status: "UNLISTED",
      matchType: "NO_MATCH",
      reasonCode: "NO_EVENT_CONCEPT_MATCH",
      rationale: "The passage does not contain the reported event or an approved equivalent concept.",
    };
  }

  if (indicationOnly(evidence.section, sentence)) {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "NO_MATCH",
      reasonCode: "NON_ADVERSE_REACTION_CONTEXT",
      rationale: "The event is mentioned in a non-adverse-reaction context and therefore does not establish listedness.",
    };
  }

  if (hasNegation(sentence)) {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "NEGATED",
      reasonCode: "NEGATED_LABEL_MENTION",
      rationale: "The matching event is explicitly negated in the labeling passage.",
    };
  }

  if (classEffectOnly(sentence)) {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "CLASS_EFFECT",
      reasonCode: "CLASS_EFFECT_NOT_PRODUCT_SPECIFIC",
      rationale: "The event is described only as a class effect and is not established for the subject product.",
    };
  }

  if (otherProductOnly(sentence)) {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "OTHER_PRODUCT",
      reasonCode: "EVENT_ATTRIBUTED_TO_OTHER_PRODUCT",
      rationale: "The matching event is attributed to another product or comparator.",
    };
  }

  const condition = conditionDecision(sentence, input.caseContext);
  if (condition.status === "FAIL") {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "CONDITIONAL_MISMATCH",
      reasonCode: "REQUIRED_CONTEXT_CONTRADICTED",
      rationale: `The label describes the event only under a ${condition.condition} condition that is explicitly absent in the case.`,
    };
  }

  if (condition.status === "UNRESOLVED") {
    return {
      evidence,
      conceptMatched: true,
      status: "UNRESOLVED",
      matchType: "CONDITIONAL_UNKNOWN",
      reasonCode: "REQUIRED_CONTEXT_UNRESOLVED",
      rationale: `The event concept matches, but the required ${condition.condition} scenario cannot be confirmed or excluded.`,
    };
  }

  const restrictiveQualifier = labelRestrictiveQualifier(sentence, input.reportedEvent);
  if (restrictiveQualifier) {
    return {
      evidence,
      conceptMatched: true,
      status: "UNLISTED",
      matchType: "QUALIFIER_MISMATCH",
      reasonCode: "LABEL_REQUIRES_NARROWER_QUALIFIER",
      rationale: `The label lists the event only with the qualifier "${restrictiveQualifier}", which is not established by the reported event.`,
    };
  }

  if (isLabEvent(input)) {
    const threshold = thresholdFromSentence(sentence);
    if (threshold !== null) {
      const ratio = caseUlnRatio(input);
      if (ratio === null || ratio <= threshold) {
        return {
          evidence,
          conceptMatched: true,
          status: "UNLISTED",
          matchType: "LAB_THRESHOLD_MISMATCH",
          reasonCode: "LABEL_THRESHOLD_NOT_ESTABLISHED_IN_CASE",
          rationale: ratio === null
            ? `The label requires a laboratory abnormality greater than ${threshold} × ULN, but the case does not establish that threshold.`
            : `The case laboratory value does not exceed the label threshold of ${threshold} × ULN.`,
        };
      }
    }
  }

  const normalizedEvent = normalize(input.reportedEvent);
  const normalizedSentence = normalize(sentence);
  const baseEvent = stripCaseQualifiers(input.reportedEvent);
  const synonym = synonymCanonical(baseEvent);
  let matchType = concept.matchType;

  if (isLabEvent(input)) {
    matchType = synonym !== normalize(baseEvent) || !normalizedSentence.includes(normalize(baseEvent))
      ? "LAB_SYNONYM"
      : "LAB_EXACT";
  } else if (
    normalizedEvent !== normalize(baseEvent) &&
    normalizedSentence.includes(normalize(baseEvent))
  ) {
    matchType = "CASE_NARROWER_THAN_LABEL";
  } else if (
    synonym !== normalize(baseEvent) &&
    normalizedSentence.includes(synonym)
  ) {
    matchType = "SYNONYM";
  }

  return {
    evidence,
    conceptMatched: true,
    status: "LISTED",
    matchType,
    reasonCode: condition.condition ? "REQUIRED_CONTEXT_CONFIRMED" : "POSITIVE_PRODUCT_SPECIFIC_MATCH",
    rationale: condition.condition
      ? `The event concept matches and the required ${condition.condition} condition is confirmed.`
      : "The reported event is supported by a positive product-specific label concept without a disqualifying qualifier or context mismatch.",
  };
}

export function assessListedness(input: ListednessAssessmentInput): ListednessAssessment {
  const reportedEvent = String(input.reportedEvent ?? "").trim();

  if (!reportedEvent) {
    return {
      reportedEvent,
      normalizedEvent: "",
      listedness: "UNRESOLVED",
      manualReviewRequired: true,
      reasonCode: "MISSING_REPORTED_EVENT",
      rationale: "A reported event is required for listedness assessment.",
      evidenceDecisions: [],
    };
  }

  if (!Array.isArray(input.labelEvidence) || input.labelEvidence.length === 0) {
    return {
      reportedEvent,
      normalizedEvent: normalize(reportedEvent),
      listedness: "UNRESOLVED",
      manualReviewRequired: true,
      reasonCode: "NO_GOVERNED_LABEL_EVIDENCE",
      rationale: "No governed labeling evidence was supplied for the event assessment.",
      evidenceDecisions: [],
    };
  }

  const decisions = input.labelEvidence.map((evidence) => evidenceDecision(input, evidence));
  const listed = decisions.find((item) => item.status === "LISTED");
  if (listed) {
    return {
      reportedEvent,
      normalizedEvent: normalize(reportedEvent),
      listedness: "LISTED",
      manualReviewRequired: false,
      reasonCode: listed.reasonCode,
      rationale: listed.rationale,
      bestEvidence: listed.evidence,
      evidenceDecisions: decisions,
    };
  }

  const unresolved = decisions.find((item) => item.status === "UNRESOLVED");
  if (unresolved) {
    return {
      reportedEvent,
      normalizedEvent: normalize(reportedEvent),
      listedness: "UNRESOLVED",
      manualReviewRequired: true,
      reasonCode: unresolved.reasonCode,
      rationale: unresolved.rationale,
      bestEvidence: unresolved.evidence,
      evidenceDecisions: decisions,
    };
  }

  const matchedButExcluded = decisions.find((item) => item.conceptMatched);
  return {
    reportedEvent,
    normalizedEvent: normalize(reportedEvent),
    listedness: "UNLISTED",
    manualReviewRequired: false,
    reasonCode: matchedButExcluded?.reasonCode ?? "NO_LISTED_EVENT_FOUND",
    rationale: matchedButExcluded?.rationale ??
      "No positive product-specific label evidence supports the reported event or an approved equivalent concept.",
    bestEvidence: matchedButExcluded?.evidence,
    evidenceDecisions: decisions,
  };
}

export const LISTEDNESS_CONTROLLED_SYNONYM_GROUPS = CONTROLLED_SYNONYM_GROUPS;
