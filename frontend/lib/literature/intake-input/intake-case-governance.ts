export interface IntakePatientSegment {
  patientSegmentKey: string;
  patientLabel?: string;
  identifiablePatientStatus?: string;
  age?: string;
  sex?: string;
  country?: string;
  evidence?: string;
  products: string[];
  events: string[];
}

export interface IntakePairAssessment {
  id?: string;
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
  [key: string]: unknown;
}

export interface GovernedPatientCaseCandidate {
  patient: IntakePatientSegment;
  relations: Array<{
    patientSegmentKey: string;
    reportedProduct: string;
    clinicalEvent: string;
    expectedness: IntakePairAssessment;
    causality: IntakePairAssessment;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

function parsePatients(value: unknown): IntakePatientSegment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const patientSegmentKey = text(entry.patientSegmentKey);
    if (!patientSegmentKey) return [];

    return [{
      patientSegmentKey,
      patientLabel: text(entry.patientLabel) || undefined,
      identifiablePatientStatus: text(entry.identifiablePatientStatus) || undefined,
      age: text(entry.age) || undefined,
      sex: text(entry.sex) || undefined,
      country: text(entry.country) || undefined,
      evidence: text(entry.evidence) || undefined,
      products: list(entry.products),
      events: list(entry.events),
    }];
  });
}

function parseAssessments(value: unknown): IntakePairAssessment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const patientSegmentKey = text(entry.patient_segment_key || entry.patientSegmentKey);
    const reportedProduct = text(entry.reported_product || entry.reportedProduct);
    const clinicalEvent = text(entry.clinical_event || entry.clinicalEvent);
    if (!patientSegmentKey || !reportedProduct || !clinicalEvent) return [];

    return [{
      ...entry,
      patientSegmentKey,
      reportedProduct,
      clinicalEvent,
    }];
  });
}

export function patientProductEventKey(input: {
  patientSegmentKey: string;
  reportedProduct: string;
  clinicalEvent: string;
}): string {
  return [
    input.patientSegmentKey.trim(),
    input.reportedProduct.trim(),
    input.clinicalEvent.trim(),
  ].join("::");
}

function indexedAssessments(
  value: unknown,
  label: string,
): Map<string, IntakePairAssessment> {
  const map = new Map<string, IntakePairAssessment>();

  for (const assessment of parseAssessments(value)) {
    const key = patientProductEventKey(assessment);
    if (map.has(key)) {
      throw new Error(
        `Duplicate ${label} assessment for governed patient-product-event relation ${key}.`,
      );
    }
    map.set(key, assessment);
  }

  return map;
}

export function buildGovernedPatientCaseCandidates(input: {
  patientSegments: unknown;
  labelAssessments: unknown;
  causalityAssessments: unknown;
}): GovernedPatientCaseCandidate[] {
  const patients = parsePatients(input.patientSegments);
  if (patients.length === 0) {
    throw new Error(
      "Intake generation requires at least one governed patient segment.",
    );
  }

  const patientMap = new Map(
    patients.map((patient) => [patient.patientSegmentKey, patient] as const),
  );
  if (patientMap.size !== patients.length) {
    throw new Error("Patient segmentation contains duplicate patient segment keys.");
  }

  const expectedness = indexedAssessments(
    input.labelAssessments,
    "expectedness",
  );
  const causality = indexedAssessments(
    input.causalityAssessments,
    "causality",
  );

  const expectednessKeys = [...expectedness.keys()].sort();
  const causalityKeys = [...causality.keys()].sort();

  if (
    expectednessKeys.length !== causalityKeys.length ||
    expectednessKeys.some((key, index) => key !== causalityKeys[index])
  ) {
    throw new Error(
      "Expectedness and causality must resolve the same explicit patient-product-event relations before Medical Review approval or Intake generation.",
    );
  }

  const relationsByPatient = new Map<
    string,
    GovernedPatientCaseCandidate["relations"]
  >();

  for (const key of expectednessKeys) {
    const labelAssessment = expectedness.get(key);
    const causalityAssessment = causality.get(key);
    if (!labelAssessment || !causalityAssessment) continue;

    const patient = patientMap.get(labelAssessment.patientSegmentKey);
    if (!patient) {
      throw new Error(
        `Assessment relation ${key} references a patient segment that does not exist.`,
      );
    }
    if (!patient.products.includes(labelAssessment.reportedProduct)) {
      throw new Error(
        `Assessment relation ${key} uses a product not assigned to the governed patient segment.`,
      );
    }
    if (!patient.events.includes(labelAssessment.clinicalEvent)) {
      throw new Error(
        `Assessment relation ${key} uses an event not assigned to the governed patient segment.`,
      );
    }

    const relations = relationsByPatient.get(patient.patientSegmentKey) || [];
    relations.push({
      patientSegmentKey: patient.patientSegmentKey,
      reportedProduct: labelAssessment.reportedProduct,
      clinicalEvent: labelAssessment.clinicalEvent,
      expectedness: labelAssessment,
      causality: causalityAssessment,
    });
    relationsByPatient.set(patient.patientSegmentKey, relations);
  }

  return patients.map((patient) => {
    const relations = relationsByPatient.get(patient.patientSegmentKey) || [];
    if (relations.length === 0) {
      throw new Error(
        `Patient segment ${patient.patientSegmentKey} has no explicit governed product-event relation. Cartesian Product × Event inference is prohibited.`,
      );
    }
    return { patient, relations };
  });
}
