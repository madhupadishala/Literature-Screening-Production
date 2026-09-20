import type {
  EvidenceStatus,
  IcsrCriteriaAssessment,
  PatientSafetyAssessment,
  PVDecisionAssessment,
  PVDecisionAssessmentInput,
  SafetyEvidenceExtraction,
} from "./types";

const SAFETY_KNOWLEDGE = ["VAL-005"] as const;
const ICSR_KNOWLEDGE = ["VAL-002", "VAL-003", "VAL-005"] as const;

function presentWhenDetected(
  explicit: EvidenceStatus,
  detected: readonly unknown[],
): EvidenceStatus {
  if (explicit !== "UNRESOLVED") return explicit;
  return detected.length > 0 ? "PRESENT" : "UNRESOLVED";
}

function combineEventStatus(
  adverseEvent: EvidenceStatus,
  specialSituation: EvidenceStatus,
): EvidenceStatus {
  if (adverseEvent === "CONFLICTING" || specialSituation === "CONFLICTING") {
    return "CONFLICTING";
  }
  if (adverseEvent === "PRESENT" || specialSituation === "PRESENT") {
    return "PRESENT";
  }
  if (adverseEvent === "ABSENT" && specialSituation === "ABSENT") {
    return "ABSENT";
  }
  return "UNRESOLVED";
}

function suspectProductStatus(
  input: PVDecisionAssessmentInput,
): EvidenceStatus {
  const roles = input.suspectEvidence.map((item) => item.role ?? "UNRESOLVED");
  if (roles.includes("SUSPECT")) return "PRESENT";

  if (
    input.suspectEvidence.some((item) =>
      ["CONCOMITANT", "TREATMENT", "EXPOSURE", "PRODUCT_MENTION"].includes(
        item.role ?? "",
      ),
    )
  ) {
    return "ABSENT";
  }

  return input.safetyEvidence.medicinalProductExposure === "ABSENT"
    ? "ABSENT"
    : "UNRESOLVED";
}

function firstSuspectEvidence(input: PVDecisionAssessmentInput): string | undefined {
  return input.suspectEvidence.find((item) => item.role === "SUSPECT")
    ?.sourceEvidence;
}

function patientSafetyAssessment(
  input: PVDecisionAssessmentInput,
): PatientSafetyAssessment {
  const extraction = input.safetyEvidence;
  const medicinalProductExposure = presentWhenDetected(
    extraction.medicinalProductExposure,
    input.suspectEvidence,
  );
  const adverseEventOrReaction = presentWhenDetected(
    extraction.adverseEventOrReaction,
    input.detectedEvents,
  );
  const specialSituation = presentWhenDetected(
    extraction.specialSituation,
    input.detectedSpecialSituations,
  );
  const safetyEvent = combineEventStatus(
    adverseEventOrReaction,
    specialSituation,
  );

  const reasons: string[] = [];
  let relevance: PatientSafetyAssessment["relevance"] = "UNRESOLVED";

  if (extraction.populationType === "ANIMAL") {
    relevance = "NOT_RELEVANT";
    reasons.push("The supplied evidence identifies an animal-only population.");
  } else if (
    medicinalProductExposure === "PRESENT" &&
    safetyEvent === "PRESENT"
  ) {
    relevance = "RELEVANT";
    reasons.push(
      "Medicinal-product exposure and an adverse event/reaction or PV special situation are supported by the article evidence.",
    );
  } else if (
    medicinalProductExposure === "ABSENT" ||
    safetyEvent === "ABSENT"
  ) {
    relevance = "NOT_RELEVANT";
    reasons.push(
      medicinalProductExposure === "ABSENT"
        ? "No medicinal-product exposure is supported by the supplied evidence."
        : "No adverse event/reaction or PV special situation is supported by the supplied evidence.",
    );
  } else {
    reasons.push(
      "Patient-safety relevance cannot be concluded from the available evidence without review.",
    );
  }

  return {
    relevance,
    humanSafetyInformation:
      relevance === "RELEVANT"
        ? true
        : relevance === "NOT_RELEVANT"
          ? false
          : null,
    populationType: extraction.populationType,
    medicinalProductExposure,
    adverseEventOrReaction,
    specialSituation,
    manualReviewRequired:
      relevance === "UNRESOLVED" ||
      [
        medicinalProductExposure,
        adverseEventOrReaction,
        specialSituation,
      ].includes("CONFLICTING"),
    reasons,
    evidence: {
      patient: extraction.patientEvidence,
      product:
        extraction.productEvidence ||
        firstSuspectEvidence(input),
      event:
        extraction.eventEvidence ||
        input.detectedEvents[0],
      specialSituation:
        extraction.specialSituationEvidence ||
        input.detectedSpecialSituations[0],
    },
    appliedKnowledgeObjectIds: [...SAFETY_KNOWLEDGE],
  };
}

function icsrAssessment(
  input: PVDecisionAssessmentInput,
): IcsrCriteriaAssessment {
  const extraction = input.safetyEvidence;
  const identifiablePatient = extraction.patientIdentifiable;
  const identifiableReporter = extraction.reporterIdentifiable;
  const suspectProduct = suspectProductStatus(input);
  const adverseEvent = presentWhenDetected(
    extraction.adverseEventOrReaction,
    input.detectedEvents,
  );
  const specialSituation = presentWhenDetected(
    extraction.specialSituation,
    input.detectedSpecialSituations,
  );
  const adverseEventOrSpecialSituation = combineEventStatus(
    adverseEvent,
    specialSituation,
  );

  const criteria = {
    identifiablePatient,
    identifiableReporter,
    suspectProduct,
    adverseEventOrSpecialSituation,
  };

  const values = Object.values(criteria);
  const allPresent = values.every((value) => value === "PRESENT");
  const anyAbsent = values.some((value) => value === "ABSENT");
  const anyConflict = values.some((value) => value === "CONFLICTING");

  const conclusion: IcsrCriteriaAssessment["conclusion"] = allPresent
    ? "POTENTIAL_ICSR"
    : anyAbsent
      ? "NOT_ICSR"
      : "UNRESOLVED";

  const missingOrUnresolvedCriteria = Object.entries(criteria)
    .filter(([, value]) => value !== "PRESENT")
    .map(([key]) => key);

  const reasons: string[] = [];
  if (conclusion === "POTENTIAL_ICSR") {
    reasons.push(
      "The generic minimum literature ICSR elements are supported independently of company ownership.",
    );
  } else if (conclusion === "NOT_ICSR") {
    reasons.push(
      "At least one generic minimum literature ICSR element is explicitly absent.",
    );
  } else {
    reasons.push(
      "One or more generic minimum literature ICSR elements remain unresolved or conflicting.",
    );
  }

  return {
    identifiablePatient,
    identifiableReporter,
    suspectProduct,
    adverseEventOrSpecialSituation,
    minimumCriteriaSatisfied: allPresent ? true : anyAbsent ? false : null,
    conclusion,
    manualReviewRequired:
      conclusion === "UNRESOLVED" || anyConflict,
    missingOrUnresolvedCriteria,
    reasons,
    evidence: {
      patient: extraction.patientEvidence,
      reporter: extraction.reporterEvidence,
      suspectProduct:
        extraction.productEvidence ||
        firstSuspectEvidence(input),
      eventOrSpecialSituation:
        extraction.eventEvidence ||
        extraction.specialSituationEvidence ||
        input.detectedEvents[0] ||
        input.detectedSpecialSituations[0],
    },
    appliedKnowledgeObjectIds: [...ICSR_KNOWLEDGE],
  };
}

export function assessPVDecisionArchitecture(
  input: PVDecisionAssessmentInput,
): PVDecisionAssessment {
  return {
    patientSafety: patientSafetyAssessment(input),
    icsr: icsrAssessment(input),
  };
}

export function unresolvedSafetyEvidence(): SafetyEvidenceExtraction {
  return {
    populationType: "UNRESOLVED",
    patientIdentifiable: "UNRESOLVED",
    reporterIdentifiable: "UNRESOLVED",
    medicinalProductExposure: "UNRESOLVED",
    adverseEventOrReaction: "UNRESOLVED",
    specialSituation: "UNRESOLVED",
  };
}
