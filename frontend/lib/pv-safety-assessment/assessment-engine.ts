import type {
  ProductSafetyAssessment,
  ProductSafetyAssessmentInput,
  PvSafetyAssessmentInput,
  PvSafetyAssessmentResult,
  SafetyRelevance,
} from "./types";
import { PV_SAFETY_V1_KNOWLEDGE_OBJECTS } from "./types";

const KNOWLEDGE_GAPS = [
  "PV-SAFETY-GAP-001 drug-role taxonomy and multi-drug attribution",
  "PV-SAFETY-GAP-002 author causality and alternative-cause hierarchy",
  "PV-SAFETY-GAP-003 dose-response/dechallenge/rechallenge interpretation",
  "PV-SAFETY-GAP-004 detailed special-situation taxonomy",
  "PV-SAFETY-GAP-005 symptoms-versus-final-diagnosis hierarchy",
  "PV-SAFETY-GAP-006 ICSR-versus-aggregate-safety relevance",
  "PV-SAFETY-GAP-007 title-only evidence handling",
] as const;

function assessProduct(
  input: ProductSafetyAssessmentInput,
): ProductSafetyAssessment {
  const rationale: string[] = [];

  if (
    input.authorCausality === "ATTRIBUTED" ||
    input.authorCausality === "POSSIBLY_RELATED"
  ) {
    rationale.push("The source attributes or possibly relates the event to this product.");
  }

  if (
    input.authorCausality === "RULED_OUT" ||
    input.authorCausality === "ATTRIBUTED_TO_OTHER_CAUSE"
  ) {
    rationale.push("The source rules out this product or attributes the event to another cause.");
  }

  if (input.role === "CONCOMITANT" || input.role === "TREATMENT" || input.role === "PRODUCT_MENTION") {
    rationale.push("Product presence alone does not establish a suspect drug-event relationship.");
  }

  if (input.role === "COMBINATION_INGREDIENT") {
    rationale.push(
      "A combination-product ingredient is not automatically a suspect for every event attributed to the combination or another ingredient.",
    );
  }

  if (input.alternativeCausePresent === "PRESENT") {
    rationale.push("An alternative cause is explicitly supported and must be considered.");
  }

  let suspectForEvent: boolean | null = null;
  if (
    ["SUSPECT", "CO_SUSPECT"].includes(input.role) &&
    input.eventRelation === "SUPPORTED" &&
    !["RULED_OUT", "ATTRIBUTED_TO_OTHER_CAUSE"].includes(input.authorCausality)
  ) {
    suspectForEvent = true;
  } else if (
    ["CONCOMITANT", "TREATMENT", "PRODUCT_MENTION"].includes(input.role) ||
    input.eventRelation === "NOT_SUPPORTED" ||
    ["RULED_OUT", "ATTRIBUTED_TO_OTHER_CAUSE"].includes(input.authorCausality)
  ) {
    suspectForEvent = false;
  }

  return {
    ...input,
    suspectForEvent,
    rationale,
  };
}

function determineSafetyRelevance(input: PvSafetyAssessmentInput): {
  relevance: SafetyRelevance;
  caseSafetyPresent: boolean | null;
  aggregateSafetyPresent: boolean | null;
} {
  const specialSituationPresent = input.specialSituations.length > 0;
  const aggregateSafetyPresent =
    (input.aggregateSafetyEvidence?.length ?? 0) > 0 ? true : false;

  let caseSafetyPresent: boolean | null = null;
  if (
    input.humanPopulation === "PRESENT" &&
    input.identifiablePatient === "PRESENT" &&
    (input.adverseEventOrReaction === "PRESENT" || specialSituationPresent)
  ) {
    caseSafetyPresent = true;
  } else if (
    input.humanPopulation === "ABSENT" ||
    input.identifiablePatient === "ABSENT" ||
    (input.adverseEventOrReaction === "ABSENT" && !specialSituationPresent)
  ) {
    caseSafetyPresent = false;
  }

  if (caseSafetyPresent === true && aggregateSafetyPresent === true) {
    return { relevance: "BOTH", caseSafetyPresent, aggregateSafetyPresent };
  }
  if (caseSafetyPresent === true) {
    return { relevance: "CASE_SAFETY", caseSafetyPresent, aggregateSafetyPresent };
  }
  if (aggregateSafetyPresent === true) {
    return { relevance: "AGGREGATE_SAFETY", caseSafetyPresent, aggregateSafetyPresent };
  }
  if (caseSafetyPresent === false) {
    return { relevance: "NONE", caseSafetyPresent, aggregateSafetyPresent };
  }

  return { relevance: "UNRESOLVED", caseSafetyPresent, aggregateSafetyPresent };
}

export function assessPvSafety(
  input: PvSafetyAssessmentInput,
): PvSafetyAssessmentResult {
  const productAssessments = input.products.map(assessProduct);
  const safety = determineSafetyRelevance(input);
  const rationale: string[] = [];

  if (input.sourceCoverage === "FULL_TEXT") {
    rationale.push("Assessment is based on full-text evidence.");
  } else if (input.sourceCoverage === "ABSTRACT_ONLY") {
    rationale.push("Assessment is limited to abstract-level evidence.");
  } else {
    rationale.push("Assessment is limited to title-level evidence; explicit safety information is retained but deeper conclusions remain reviewable.");
  }

  if (safety.relevance === "CASE_SAFETY" || safety.relevance === "BOTH") {
    rationale.push("Patient-level safety information is present and requires full PV screening.");
  } else if (safety.relevance === "AGGREGATE_SAFETY") {
    rationale.push("Aggregate safety information is present even though a patient-level ICSR may not be established.");
  } else if (safety.relevance === "NONE") {
    rationale.push("No patient-level or aggregate safety information is currently supported by the supplied evidence.");
  } else {
    rationale.push("Safety relevance remains unresolved and cannot be finalized as an exclusion.");
  }

  const unresolvedProduct = productAssessments.some(
    (product) => product.suspectForEvent === null,
  );
  const manualReviewRequired =
    safety.relevance === "UNRESOLVED" ||
    unresolvedProduct ||
    input.sourceCoverage !== "FULL_TEXT";

  const fullScreeningRequired =
    safety.relevance === "CASE_SAFETY" ||
    safety.relevance === "AGGREGATE_SAFETY" ||
    safety.relevance === "BOTH";

  const exclusionCanBeFinalized =
    safety.relevance === "NONE" &&
    input.sourceCoverage === "FULL_TEXT" &&
    !manualReviewRequired;

  return {
    sourceCoverage: input.sourceCoverage,
    publicationType: input.publicationType,
    safetyRelevance: safety.relevance,
    caseSafetyPresent: safety.caseSafetyPresent,
    aggregateSafetyPresent: safety.aggregateSafetyPresent,
    fullScreeningRequired,
    exclusionCanBeFinalized,
    manualReviewRequired,
    productAssessments,
    specialSituations: input.specialSituations,
    finalDiagnosis: input.finalDiagnosis,
    symptoms: input.symptoms ?? [],
    rationale,
    appliedKnowledgeObjectIds: [...PV_SAFETY_V1_KNOWLEDGE_OBJECTS],
    knowledgeGaps: [...KNOWLEDGE_GAPS],
  };
}
