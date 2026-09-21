import {
  SERIOUSNESS_CRITERIA,
  SPECIAL_SITUATIONS,
  type MinimumCriterionAssessment,
  type SeriousnessCriterion,
  type SpecialSituation,
  type TriageSystemSnapshot,
} from "./triage-types";

interface SafetyEntitySnapshot {
  patients: Array<Record<string, unknown>>;
  reporters: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  sourcePayload?: Record<string, unknown>;
  intakePayload?: Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonEmptyObject(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length,
  );
}

function criterion(
  key: MinimumCriterionAssessment["key"],
  met: boolean,
  evidence: string[],
  reason: string,
): MinimumCriterionAssessment {
  return {
    key,
    status: met ? "MET" : "MISSING",
    evidence,
    reason,
  };
}

function patientCriterion(
  patients: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const patient = patients.find((item) => {
    return Boolean(
      text(item.patient_reference) ||
        text(item.sex) ||
        typeof item.age_value === "number" ||
        text(item.age_group) ||
        item.date_of_birth ||
        text(item.patient_key),
    );
  });

  return criterion(
    "IDENTIFIABLE_PATIENT",
    Boolean(patient),
    patient
      ? [
          text(patient.patient_reference) && `Reference: ${text(patient.patient_reference)}`,
          text(patient.sex) && `Sex: ${text(patient.sex)}`,
          patient.age_value !== null &&
            patient.age_value !== undefined &&
            `Age: ${String(patient.age_value)} ${text(patient.age_unit)}`.trim(),
          text(patient.age_group) && `Age group: ${text(patient.age_group)}`,
        ].filter(Boolean) as string[]
      : [],
    patient
      ? "At least one patient record contains identifying characteristics."
      : "No patient record contains sufficient identifying characteristics.",
  );
}

function reporterCriterion(
  reporters: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const reporter = reporters.find((item) => {
    const hasExistenceEvidence = Boolean(
      text(item.qualification) ||
        text(item.organization) ||
        nonEmptyObject(item.reporter_payload) ||
        nonEmptyObject(item.e2b_c2_payload),
    );
    const hasCountry = Boolean(text(item.country_code));
    return hasExistenceEvidence && hasCountry;
  });

  return criterion(
    "IDENTIFIABLE_REPORTER",
    Boolean(reporter),
    reporter
      ? [
          text(reporter.qualification) &&
            `Qualification: ${text(reporter.qualification)}`,
          text(reporter.organization) &&
            `Organisation: ${text(reporter.organization)}`,
          text(reporter.country_code) &&
            `Country: ${text(reporter.country_code)}`,
        ].filter(Boolean) as string[]
      : [],
    reporter
      ? "At least one reporter contains existence evidence and a country."
      : "No reporter currently contains sufficient existence evidence plus country.",
  );
}

function productCriterion(
  products: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const suspects = products.filter(
    (item) =>
      ["SUSPECT", "INTERACTING"].includes(text(item.role_characterization)) &&
      Boolean(text(item.reported_name)),
  );

  return criterion(
    "SUSPECT_PRODUCT",
    suspects.length > 0,
    suspects.map(
      (item) =>
        `${text(item.role_characterization)}: ${text(item.reported_name)}`,
    ),
    suspects.length
      ? "At least one suspect/interacting medicinal product is recorded."
      : "No suspect/interacting medicinal product is currently recorded.",
  );
}

function eventCriterion(
  events: Array<Record<string, unknown>>,
): MinimumCriterionAssessment {
  const eventRecords = events.filter((item) => Boolean(text(item.reported_term)));

  return criterion(
    "ADVERSE_EVENT",
    eventRecords.length > 0,
    eventRecords.map((item) => text(item.reported_term)),
    eventRecords.length
      ? "At least one reaction/event term is recorded."
      : "No reaction/event term is currently recorded.",
  );
}

function seriousness(
  events: Array<Record<string, unknown>>,
): {
  recommendation: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  evidence: Partial<Record<SeriousnessCriterion, string[]>>;
} {
  const evidence: Partial<Record<SeriousnessCriterion, string[]>> = {};
  let explicitNonSerious = false;
  let unresolved = false;

  for (const event of events) {
    const term = text(event.reported_term) || "Unspecified event";
    if (event.seriousness === true) {
      const criteria =
        event.seriousness_criteria &&
        typeof event.seriousness_criteria === "object" &&
        !Array.isArray(event.seriousness_criteria)
          ? (event.seriousness_criteria as Record<string, unknown>)
          : {};

      let mapped = false;
      for (const key of SERIOUSNESS_CRITERIA) {
        if (criteria[key] === true) {
          evidence[key] = [...(evidence[key] ?? []), term];
          mapped = true;
        }
      }
      if (!mapped) {
        evidence.IMPORTANT_MEDICAL_EVENT = [
          ...(evidence.IMPORTANT_MEDICAL_EVENT ?? []),
          `${term} (seriousness marked serious; specific criterion not captured)`,
        ];
      }
    } else if (event.seriousness === false) {
      explicitNonSerious = true;
    } else {
      unresolved = true;
    }
  }

  if (Object.keys(evidence).length > 0) {
    return { recommendation: "SERIOUS", evidence };
  }
  if (events.length > 0 && explicitNonSerious && !unresolved) {
    return { recommendation: "NON_SERIOUS", evidence };
  }
  return { recommendation: "UNRESOLVED", evidence };
}

function corpus(snapshot: SafetyEntitySnapshot): string {
  return JSON.stringify({
    patients: snapshot.patients,
    reporters: snapshot.reporters,
    products: snapshot.products,
    events: snapshot.events,
    sourcePayload: snapshot.sourcePayload ?? {},
    intakePayload: snapshot.intakePayload ?? {},
  }).toLowerCase();
}

function detectSpecialSituations(
  snapshot: SafetyEntitySnapshot,
): SpecialSituation[] {
  const value = corpus(snapshot);
  const found = new Set<SpecialSituation>();

  const rules: Array<[SpecialSituation, RegExp]> = [
    ["PREGNANCY", /\bpregnan(?:cy|t)|in[- ]utero\b/i],
    ["BREASTFEEDING", /\bbreast[- ]?feed(?:ing)?|lactat(?:ion|ing)\b/i],
    ["OVERDOSE", /\boverdos(?:e|ed|ing)\b/i],
    ["OFF_LABEL_USE", /\boff[- ]?label\b/i],
    ["MISUSE", /\bmisuse\b/i],
    ["ABUSE", /\bdrug abuse|abuse of\b/i],
    ["MEDICATION_ERROR", /\bmedication error|prescribing error|dispensing error|administration error\b/i],
    ["OCCUPATIONAL_EXPOSURE", /\boccupational exposure\b/i],
    ["LACK_OF_THERAPEUTIC_EFFICACY", /\black of (?:therapeutic )?efficacy|lack of effect|ineffective\b/i],
    ["FALSIFIED_MEDICINAL_PRODUCT", /\bfalsified medicinal product|counterfeit medicine\b/i],
  ];

  for (const [situation, rule] of rules) {
    if (rule.test(value)) found.add(situation);
  }

  for (const patient of snapshot.patients) {
    const age = typeof patient.age_value === "number" ? patient.age_value : null;
    const unit = text(patient.age_unit).toLowerCase();
    const ageGroup = text(patient.age_group).toLowerCase();

    if (
      ageGroup.includes("paediatric") ||
      ageGroup.includes("pediatric") ||
      (age !== null && unit.startsWith("year") && age < 18)
    ) {
      found.add("PEDIATRIC");
    }

    if (
      ageGroup.includes("elderly") ||
      ageGroup.includes("geriatric") ||
      (age !== null && unit.startsWith("year") && age >= 65)
    ) {
      found.add("ELDERLY");
    }

    if (text(patient.pregnancy_status)) {
      found.add("PREGNANCY");
    }
  }

  return SPECIAL_SITUATIONS.filter((item) => found.has(item));
}

export function evaluateTriageSnapshot(
  snapshot: SafetyEntitySnapshot,
): TriageSystemSnapshot {
  const criteria = [
    patientCriterion(snapshot.patients),
    reporterCriterion(snapshot.reporters),
    productCriterion(snapshot.products),
    eventCriterion(snapshot.events),
  ];

  const validityRecommendation = criteria.every(
    (item) => item.status === "MET",
  )
    ? "VALID"
    : "UNRESOLVED";

  const serious = seriousness(snapshot.events);
  const detectedSpecialSituations = detectSpecialSituations(snapshot);

  const followUpReasons = criteria
    .filter((item) => item.status !== "MET")
    .map((item) => item.reason);

  if (serious.recommendation === "UNRESOLVED" && snapshot.events.length > 0) {
    followUpReasons.push("Seriousness remains unresolved for one or more events.");
  }

  const followUpRecommended = followUpReasons.length > 0;
  const priorityRecommendation =
    serious.recommendation === "SERIOUS"
      ? "URGENT"
      : followUpRecommended
        ? "HIGH"
        : "NORMAL";

  return {
    criteria,
    validityRecommendation,
    seriousnessRecommendation: serious.recommendation,
    seriousnessEvidence: serious.evidence,
    detectedSpecialSituations,
    followUpRecommended,
    followUpReasons,
    priorityRecommendation,
  };
}
