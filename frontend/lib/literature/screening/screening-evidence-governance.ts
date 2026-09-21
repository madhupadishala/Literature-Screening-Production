import type {
  ScreeningFinding,
  ScreeningRegulatoryEvidence,
} from "@/lib/literature/screening/screening-types";
import type { SuspectProductEvidence } from "@/lib/pharmaceutical-intelligence/types";
import type { SafetyEvidenceExtraction } from "@/lib/pv-decision-intelligence/types";

export interface ScreeningEvidenceGovernanceResult {
  regulatoryEvidence: ScreeningRegulatoryEvidence;
  safetyEvidence: SafetyEvidenceExtraction;
  suspectEvidence: SuspectProductEvidence[];
  findings: ScreeningFinding[];
  corrections: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalized(value: string | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

function hasDirectCountryOfIncidenceEvidence(
  country: string,
  evidence: string | undefined,
): boolean {
  const claimedCountry = normalized(country);
  const sourceEvidence = normalized(evidence);
  if (!claimedCountry || !sourceEvidence) return false;

  const countryPattern = escapeRegex(claimedCountry);
  const exactCountry = new RegExp("\\b" + countryPattern + "\\b", "i");
  if (!exactCountry.test(sourceEvidence)) return false;

  const patientOrEvent =
    "(?:patient|case|event|reaction|adverse event|adverse reaction|hospitali[sz]ed|admitted|treated|presented|developed|occurred)";
  const locationCue = "(?:in|at|within)";

  return (
    new RegExp(
      "\\b" + patientOrEvent + "\\b.{0,100}\\b" + locationCue +
        "\\b.{0,60}\\b" + countryPattern + "\\b",
      "i",
    ).test(sourceEvidence) ||
    new RegExp(
      "\\b" + locationCue + "\\b.{0,60}\\b" + countryPattern +
        "\\b.{0,100}\\b" + patientOrEvent + "\\b",
      "i",
    ).test(sourceEvidence)
  );
}

function reconcileReporterSafetyEvidence(input: {
  safetyEvidence: SafetyEvidenceExtraction;
  reporterIdentifiers: string[];
  corrections: string[];
}): SafetyEvidenceExtraction {
  const reporters = input.reporterIdentifiers.map((value) => value.trim()).filter(Boolean);
  if (reporters.length === 0) return input.safetyEvidence;
  if (
    input.safetyEvidence.reporterIdentifiable === "PRESENT" ||
    input.safetyEvidence.reporterIdentifiable === "CONFLICTING"
  ) {
    return input.safetyEvidence;
  }

  input.corrections.push(
    "Reporter identifiability reconciled from publication metadata: " + reporters[0] + ".",
  );

  return {
    ...input.safetyEvidence,
    reporterIdentifiable: "PRESENT",
    reporterEvidence: input.safetyEvidence.reporterEvidence || reporters[0],
  };
}

function reconcileReporterFindings(input: {
  findings: ScreeningFinding[];
  reporterIdentifiers: string[];
  reporterStatus: SafetyEvidenceExtraction["reporterIdentifiable"];
}): ScreeningFinding[] {
  const reporter = input.reporterIdentifiers.map((value) => value.trim()).find(Boolean);
  if (!reporter || input.reporterStatus !== "PRESENT") return input.findings;

  return input.findings.map((finding) => {
    const combined = (finding.rule + " " + finding.comment).toLowerCase();
    const concernsReporter = combined.includes("reporter");
    const negativeReporterFinding =
      /not\s+(?:identifiable|identified|available|present)|absent|missing|unidentified/.test(
        combined,
      );

    if (!concernsReporter || !negativeReporterFinding) return finding;

    return {
      ...finding,
      passed: true,
      comment:
        "Publication author metadata identifies the reporter as " + reporter + ". " +
        "The abstract-only reporter finding was reconciled by the governed literature reporter rule.",
    };
  });
}

export function governScreeningEvidence(input: {
  regulatoryEvidence: ScreeningRegulatoryEvidence;
  safetyEvidence: SafetyEvidenceExtraction;
  suspectEvidence: SuspectProductEvidence[];
  findings: ScreeningFinding[];
  reporterIdentifiers: string[];
}): ScreeningEvidenceGovernanceResult {
  const corrections: string[] = [];
  const rawCountry =
    input.regulatoryEvidence.countryOfIncidenceStatus === "PRESENT"
      ? normalized(input.regulatoryEvidence.countryOfIncidence)
      : "";

  const acceptedCountry =
    rawCountry &&
    hasDirectCountryOfIncidenceEvidence(
      rawCountry,
      input.regulatoryEvidence.countryOfIncidenceEvidence,
    )
      ? rawCountry
      : undefined;

  const regulatoryEvidence: ScreeningRegulatoryEvidence = acceptedCountry
    ? {
        ...input.regulatoryEvidence,
        countryOfIncidenceStatus: "PRESENT",
        countryOfIncidence: acceptedCountry,
      }
    : {
        ...input.regulatoryEvidence,
        countryOfIncidenceStatus:
          input.regulatoryEvidence.countryOfIncidenceStatus === "CONFLICTING"
            ? "CONFLICTING"
            : "UNRESOLVED",
        countryOfIncidence: undefined,
      };

  if (rawCountry && !acceptedCountry) {
    corrections.push(
      'Country of Incidence "' + rawCountry +
        '" was not accepted because the supplied evidence did not establish the patient/event location. Nationality or demographic wording alone is insufficient.',
    );
  }

  const safetyEvidence = reconcileReporterSafetyEvidence({
    safetyEvidence: input.safetyEvidence,
    reporterIdentifiers: input.reporterIdentifiers,
    corrections,
  });

  const suspectEvidence = input.suspectEvidence.map((evidence) => ({
    ...evidence,
    countryOfInterest: acceptedCountry,
  }));

  let findings = reconcileReporterFindings({
    findings: input.findings,
    reporterIdentifiers: input.reporterIdentifiers,
    reporterStatus: safetyEvidence.reporterIdentifiable,
  });

  if (rawCountry && !acceptedCountry) {
    findings = [
      ...findings,
      {
        rule: "Governed Country of Incidence Evidence",
        passed: false,
        score: 0,
        comment:
          'AI-proposed COI "' + rawCountry +
          '" was downgraded to UNRESOLVED because the cited evidence does not establish event location.',
      },
    ];
  }

  return {
    regulatoryEvidence,
    safetyEvidence,
    suspectEvidence,
    findings,
    corrections,
  };
}
