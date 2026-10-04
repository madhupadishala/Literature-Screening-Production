import assert from "node:assert/strict";

import { assessPvSafety } from "../lib/pv-safety-assessment/assessment-engine";
import type { PvSafetyAssessmentInput } from "../lib/pv-safety-assessment/types";

const norco: PvSafetyAssessmentInput = {
  sourceCoverage: "FULL_TEXT",
  publicationType: "CASE_REPORT",
  humanPopulation: "PRESENT",
  identifiablePatient: "PRESENT",
  adverseEventOrReaction: "PRESENT",
  eventEvidence: [{ text: "auditory and visual hallucinations" }],
  finalDiagnosis: "Opioid-induced hallucinations",
  finalDiagnosisEvidence: [{ text: "Opioid-Induced Hallucinations: A Case Report", location: "TITLE" }],
  symptoms: ["auditory hallucinations", "visual hallucinations"],
  products: [
    {
      product: "Hydrocodone",
      role: "SUSPECT",
      eventRelation: "SUPPORTED",
      authorCausality: "ATTRIBUTED",
      authorCausalityEvidence: [{ text: "opioid-induced hallucinations", location: "TITLE" }],
    },
    {
      product: "Acetaminophen",
      role: "COMBINATION_INGREDIENT",
      eventRelation: "NOT_SUPPORTED",
      authorCausality: "ATTRIBUTED_TO_OTHER_CAUSE",
      authorCausalityEvidence: [{ text: "opioid-induced hallucinations", location: "TITLE" }],
    },
  ],
  specialSituations: [
    {
      type: "MISUSE",
      products: ["Norco"],
      evidence: [{ text: "increasing his prescribed dose up to four tablets per day" }],
    },
  ],
};

const norcoResult = assessPvSafety(norco);
assert.equal(norcoResult.safetyRelevance, "CASE_SAFETY");
assert.equal(norcoResult.fullScreeningRequired, true);
assert.equal(
  norcoResult.productAssessments.find((item) => item.product === "Hydrocodone")?.suspectForEvent,
  true,
);
assert.equal(
  norcoResult.productAssessments.find((item) => item.product === "Acetaminophen")?.suspectForEvent,
  false,
  "Combination-product co-occurrence must not make acetaminophen suspect when the source attributes hallucinations to the opioid.",
);
assert.ok(
  norcoResult.specialSituations.some((item) => item.type === "MISUSE"),
  "Dose escalation / misuse must remain visible as a separate PV special situation.",
);

const takotsubo: PvSafetyAssessmentInput = {
  sourceCoverage: "FULL_TEXT",
  publicationType: "CASE_REPORT",
  humanPopulation: "PRESENT",
  identifiablePatient: "PRESENT",
  adverseEventOrReaction: "PRESENT",
  eventEvidence: [{ text: "Takotsubo cardiomyopathy" }],
  finalDiagnosis: "Takotsubo cardiomyopathy",
  products: [
    {
      product: "Acetaminophen",
      role: "OVERDOSE_INGESTION",
      eventRelation: "NOT_SUPPORTED",
      authorCausality: "ATTRIBUTED_TO_OTHER_CAUSE",
      alternativeCausePresent: "PRESENT",
      alternativeCauseEvidence: [
        { text: "poisoning with beta-blockers, benzodiazepines, and digoxin" },
      ],
    },
    {
      product: "Metoprolol",
      role: "SUSPECT",
      eventRelation: "SUPPORTED",
      authorCausality: "ATTRIBUTED",
    },
  ],
  specialSituations: [
    {
      type: "SUICIDE_ATTEMPT",
      products: ["Metoprolol", "Digoxin", "Diazepam", "Acetaminophen/Tramadol", "Chlorzoxazone"],
      evidence: [{ text: "suicide attempt by poisoning" }],
    },
    {
      type: "INTENTIONAL_OVERDOSE",
      products: ["Metoprolol", "Digoxin", "Diazepam", "Acetaminophen/Tramadol", "Chlorzoxazone"],
      evidence: [{ text: "multiple empty blister packs" }],
    },
  ],
};

const takotsuboResult = assessPvSafety(takotsubo);
assert.equal(takotsuboResult.safetyRelevance, "CASE_SAFETY");
assert.equal(
  takotsuboResult.productAssessments.find((item) => item.product === "Acetaminophen")?.suspectForEvent,
  false,
  "Acetaminophen must not inherit Takotsubo causality solely because it was ingested in a multi-drug poisoning.",
);
assert.ok(
  takotsuboResult.specialSituations.some((item) => item.type === "SUICIDE_ATTEMPT"),
);
assert.ok(
  takotsuboResult.specialSituations.some((item) => item.type === "INTENTIONAL_OVERDOSE"),
);

const titleOnly: PvSafetyAssessmentInput = {
  sourceCoverage: "TITLE_ONLY",
  publicationType: "CASE_REPORT",
  humanPopulation: "PRESENT",
  identifiablePatient: "PRESENT",
  adverseEventOrReaction: "PRESENT",
  eventEvidence: [{ text: "Hyperbilirubinemia", location: "TITLE" }],
  finalDiagnosis: "Hyperbilirubinemia",
  finalDiagnosisEvidence: [{ text: "Hyperbilirubinemia", location: "TITLE" }],
  products: [
    {
      product: "Acetaminophen",
      role: "SUSPECT",
      eventRelation: "UNRESOLVED",
      authorCausality: "NOT_STATED",
      roleEvidence: { text: "acetaminophen (paracetamol) overdose", location: "TITLE" },
    },
  ],
  specialSituations: [
    {
      type: "INTENTIONAL_OVERDOSE",
      products: ["Acetaminophen"],
      evidence: [{ text: "acetaminophen (paracetamol) overdose", location: "TITLE" }],
    },
  ],
};

const titleResult = assessPvSafety(titleOnly);
assert.equal(titleResult.caseSafetyPresent, true);
assert.equal(titleResult.fullScreeningRequired, true);
assert.equal(titleResult.manualReviewRequired, true);
assert.ok(
  titleResult.specialSituations.some((item) => item.type === "INTENTIONAL_OVERDOSE"),
  "Explicit title-only overdose information must not be discarded.",
);

const aggregate: PvSafetyAssessmentInput = {
  sourceCoverage: "FULL_TEXT",
  publicationType: "OBSERVATIONAL_STUDY",
  humanPopulation: "PRESENT",
  identifiablePatient: "ABSENT",
  adverseEventOrReaction: "PRESENT",
  products: [
    {
      product: "Drug A",
      role: "EXPOSURE",
      eventRelation: "SUPPORTED",
      authorCausality: "POSSIBLY_RELATED",
    },
  ],
  specialSituations: [],
  aggregateSafetyEvidence: [
    { text: "The exposed cohort showed a higher incidence of serious hepatic events." },
  ],
};

const aggregateResult = assessPvSafety(aggregate);
assert.equal(aggregateResult.caseSafetyPresent, false);
assert.equal(aggregateResult.aggregateSafetyPresent, true);
assert.equal(aggregateResult.safetyRelevance, "AGGREGATE_SAFETY");
assert.equal(aggregateResult.fullScreeningRequired, true);

const noSafety: PvSafetyAssessmentInput = {
  sourceCoverage: "FULL_TEXT",
  publicationType: "REVIEW_ARTICLE",
  humanPopulation: "PRESENT",
  identifiablePatient: "ABSENT",
  adverseEventOrReaction: "ABSENT",
  products: [
    {
      product: "Drug A",
      role: "PRODUCT_MENTION",
      eventRelation: "NOT_SUPPORTED",
      authorCausality: "NOT_STATED",
    },
  ],
  specialSituations: [],
  aggregateSafetyEvidence: [],
};

const noSafetyResult = assessPvSafety(noSafety);
assert.equal(noSafetyResult.safetyRelevance, "NONE");
assert.equal(noSafetyResult.fullScreeningRequired, false);
assert.equal(noSafetyResult.exclusionCanBeFinalized, true);

assert.ok(
  norcoResult.knowledgeGaps.some((gap) => gap.includes("drug-role taxonomy")),
  "New drug-role logic must remain explicitly identified as a controlled-knowledge gap until approved.",
);
assert.ok(
  aggregateResult.knowledgeGaps.some((gap) => gap.includes("ICSR-versus-aggregate")),
  "Aggregate-safety logic must not be represented as already covered by the existing controlled repository.",
);

console.log("PV Safety Assessment Engine v1 verification passed.");
console.table([
  { scenario: "Norco", safety: norcoResult.safetyRelevance, fullScreen: norcoResult.fullScreeningRequired },
  { scenario: "Takotsubo", safety: takotsuboResult.safetyRelevance, fullScreen: takotsuboResult.fullScreeningRequired },
  { scenario: "Title only overdose", safety: titleResult.safetyRelevance, fullScreen: titleResult.fullScreeningRequired },
  { scenario: "Aggregate study", safety: aggregateResult.safetyRelevance, fullScreen: aggregateResult.fullScreeningRequired },
  { scenario: "No safety", safety: noSafetyResult.safetyRelevance, fullScreen: noSafetyResult.fullScreeningRequired },
]);
