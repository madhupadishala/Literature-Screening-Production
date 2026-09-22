import type {
  E2BR3CasePayload,
  SafetyEventDraft,
  SafetyPatientDraft,
  SafetyProductDraft,
  SafetyReporterDraft,
  SafetyTestDraft,
  SourceLineage,
} from "./safety-types";
import {
  E2B_PROFILE,
  SAFETY_BACKBONE_SCHEMA_VERSION,
} from "./safety-types";
import { validateE2BR3CasePayload } from "./safety-validation";

export interface BuildCasePayloadInput {
  tenantId: string;
  caseId: string;
  caseKey: string;
  intakeRecordId: string;
  version: number;
  lineage: SourceLineage;
  identification: Record<string, unknown>;
  reporters: SafetyReporterDraft[];
  patient: SafetyPatientDraft;
  events: SafetyEventDraft[];
  tests: SafetyTestDraft[];
  products: SafetyProductDraft[];
  narrative: Record<string, unknown>;
}

export function buildE2BR3CasePayload(
  input: BuildCasePayloadInput,
): E2BR3CasePayload {
  if (input.version < 1) throw new Error("Case payload version must be at least 1.");
  if (!input.caseKey.trim()) throw new Error("caseKey is required.");
  if (!input.patient.patientKey.trim()) throw new Error("A case patient is required.");

  const payload: E2BR3CasePayload = {
    profile: E2B_PROFILE,
    schemaVersion: SAFETY_BACKBONE_SCHEMA_VERSION,
    C: {
      ...input.identification,
      primarySources: input.reporters.map((reporter) => ({
        ...reporter.e2bC2,
        reporterKey: reporter.reporterKey,
        primarySource: reporter.primarySource,
        qualification: reporter.qualification,
        organization: reporter.organization,
        countryCode: reporter.countryCode,
      })),
    },
    D: {
      ...input.patient.e2bD,
      patientKey: input.patient.patientKey,
      patientReference: input.patient.patientReference,
      sex: input.patient.sex,
      ageValue: input.patient.ageValue,
      ageUnit: input.patient.ageUnit,
      ageGroup: input.patient.ageGroup,
      dateOfBirth: input.patient.dateOfBirth,
      deathDate: input.patient.deathDate,
      weightKg: input.patient.weightKg,
      heightCm: input.patient.heightCm,
      pregnancyStatus: input.patient.pregnancyStatus,
      medicalHistory: input.patient.medicalHistory ?? [],
      parentInformation: input.patient.parentInformation ?? {},
    },
    E: input.events.map((event) => ({
      ...event.e2bE,
      eventKey: event.eventKey,
      reportedTerm: event.reportedTerm,
      meddraTerm: event.meddraTerm,
      meddraCode: event.meddraCode,
      meddraVersion: event.meddraVersion,
      onsetDate: event.onsetDate,
      endDate: event.endDate,
      outcome: event.outcome,
      seriousness: event.seriousness,
      seriousnessCriteria: event.seriousnessCriteria ?? {},
      medicallyConfirmed: event.medicallyConfirmed,
      countryCode: event.countryCode,
    })),
    F: input.tests.map((test) => ({
      ...test.e2bF,
      testKey: test.testKey,
      testName: test.testName,
      testDate: test.testDate,
      resultValue: test.resultValue,
      resultUnit: test.resultUnit,
      referenceRange: test.referenceRange,
      comments: test.comments,
    })),
    G: input.products.map((product) => ({
      ...product.e2bG,
      productKey: product.productKey,
      reportedName: product.reportedName,
      roleCharacterization: product.roleCharacterization,
      activeSubstances: product.activeSubstances ?? [],
      authorization: product.authorization ?? {},
      indication: product.indication ?? {},
      dosage: product.dosage ?? [],
      route: product.route ?? {},
      therapyDates: product.therapyDates ?? {},
      batchLotNumber: product.batchLotNumber,
      actionTaken: product.actionTaken,
      rechallenge: product.rechallenge ?? {},
    })),
    H: input.narrative,
    nexus: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      caseKey: input.caseKey,
      intakeRecordId: input.intakeRecordId,
      version: input.version,
      lineage: input.lineage,
    },
  };

  return validateE2BR3CasePayload(payload);
}
