import {
  DUPLICATE_CANDIDATE_THRESHOLD,
  type DuplicateConfidenceBand,
  type DuplicateFingerprint,
  type DuplicateMatchResult,
  type DuplicateMatchedFactor,
} from "./duplicate-types";

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function numericAge(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function intersection(
  left: string[],
  right: string[],
): string[] {
  const rightSet = new Set(right.map(normalize).filter(Boolean));
  return Array.from(
    new Set(
      left
        .map(normalize)
        .filter((item) => item && rightSet.has(item)),
    ),
  );
}

function add(
  factors: DuplicateMatchedFactor[],
  key: string,
  weight: number,
  evidence: string,
): void {
  factors.push({ key, weight, evidence });
}

function patientFactors(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
  factors: DuplicateMatchedFactor[],
): void {
  for (const patient of source.patients) {
    for (const other of candidate.patients) {
      const patientReference = normalize(patient.patientReference);
      const candidateReference = normalize(other.patientReference);
      if (
        patientReference &&
        candidateReference &&
        patientReference === candidateReference
      ) {
        add(
          factors,
          "PATIENT_REFERENCE_EXACT",
          22,
          `Patient reference matches: ${patient.patientReference}`,
        );
      }

      const dob = dateOnly(patient.dateOfBirth);
      const otherDob = dateOnly(other.dateOfBirth);
      if (dob && otherDob && dob === otherDob) {
        add(factors, "DATE_OF_BIRTH_EXACT", 20, `DOB matches: ${dob}`);
      }

      const sex = normalize(patient.sex);
      const otherSex = normalize(other.sex);
      if (sex && otherSex && sex === otherSex) {
        add(factors, "SEX_EXACT", 5, `Sex matches: ${patient.sex}`);
      }

      const age = numericAge(patient.ageValue);
      const otherAge = numericAge(other.ageValue);
      const ageUnit = normalize(patient.ageUnit);
      const otherAgeUnit = normalize(other.ageUnit);
      if (
        age !== null &&
        otherAge !== null &&
        ageUnit &&
        ageUnit === otherAgeUnit
      ) {
        if (age === otherAge) {
          add(
            factors,
            "AGE_EXACT",
            8,
            `Age matches: ${age} ${patient.ageUnit ?? ""}`.trim(),
          );
        } else if (Math.abs(age - otherAge) <= 1 && ageUnit.startsWith("year")) {
          add(
            factors,
            "AGE_NEAR",
            4,
            `Age is within one year: ${age} vs ${otherAge}`,
          );
        }
      }
    }
  }
}

function reporterFactors(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
  factors: DuplicateMatchedFactor[],
): void {
  const organizations = intersection(
    source.reporters.map((item) => item.organization ?? ""),
    candidate.reporters.map((item) => item.organization ?? ""),
  );
  if (organizations.length) {
    add(
      factors,
      "REPORTER_ORGANIZATION",
      5,
      `Reporter organisation overlap: ${organizations.join(", ")}`,
    );
  }

  const qualifications = intersection(
    source.reporters.map((item) => item.qualification ?? ""),
    candidate.reporters.map((item) => item.qualification ?? ""),
  );
  if (qualifications.length) {
    add(
      factors,
      "REPORTER_QUALIFICATION",
      2,
      `Reporter qualification overlap: ${qualifications.join(", ")}`,
    );
  }
}

function productFactors(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
  factors: DuplicateMatchedFactor[],
): void {
  const products = intersection(
    source.products
      .filter((item) =>
        ["SUSPECT", "INTERACTING", ""].includes(
          (item.roleCharacterization ?? "").toUpperCase(),
        ),
      )
      .map((item) => item.reportedName),
    candidate.products
      .filter((item) =>
        ["SUSPECT", "INTERACTING", ""].includes(
          (item.roleCharacterization ?? "").toUpperCase(),
        ),
      )
      .map((item) => item.reportedName),
  );

  if (products.length) {
    add(
      factors,
      "PRODUCT_OVERLAP",
      20,
      `Product overlap: ${products.join(", ")}`,
    );
  }
}

function eventFactors(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
  factors: DuplicateMatchedFactor[],
): void {
  const events = intersection(
    source.events.map((item) => item.reportedTerm),
    candidate.events.map((item) => item.reportedTerm),
  );
  if (events.length) {
    add(
      factors,
      "EVENT_OVERLAP",
      20,
      `Event/reaction overlap: ${events.join(", ")}`,
    );
  }

  const onset = new Set(
    source.events.map((item) => dateOnly(item.onsetDate)).filter(Boolean),
  );
  const matchingOnsets = Array.from(
    new Set(
      candidate.events
        .map((item) => dateOnly(item.onsetDate))
        .filter((item) => item && onset.has(item)),
    ),
  );
  if (matchingOnsets.length) {
    add(
      factors,
      "EVENT_ONSET_DATE",
      10,
      `Event onset date overlap: ${matchingOnsets.join(", ")}`,
    );
  }
}

function identityFactors(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
  factors: DuplicateMatchedFactor[],
): void {
  const identifiers = intersection(
    [
      ...(source.sourceIdentifiers ?? []),
      source.externalReference ?? "",
      source.sourceRecordKey ?? "",
    ],
    [
      ...(candidate.sourceIdentifiers ?? []),
      candidate.externalReference ?? "",
      candidate.sourceRecordKey ?? "",
      candidate.caseKey ?? "",
    ],
  );

  if (identifiers.length) {
    add(
      factors,
      "SOURCE_IDENTIFIER_EXACT",
      35,
      `Source/case identifier overlap: ${identifiers.join(", ")}`,
    );
  }

  const country = normalize(source.countryCode);
  const otherCountry = normalize(candidate.countryCode);
  if (country && otherCountry && country === otherCountry) {
    add(
      factors,
      "COUNTRY_EXACT",
      5,
      `Country matches: ${source.countryCode}`,
    );
  }

  const sourceReceipt = dateOnly(
    source.latestReceiptDate ?? source.initialReceiptDate,
  );
  const candidateReceipt = dateOnly(
    candidate.latestReceiptDate ?? candidate.initialReceiptDate,
  );
  if (sourceReceipt && candidateReceipt) {
    const delta =
      Math.abs(
        new Date(sourceReceipt).getTime() - new Date(candidateReceipt).getTime(),
      ) /
      86400000;
    if (delta <= 7) {
      add(
        factors,
        "RECEIPT_DATE_PROXIMITY",
        3,
        `Receipt dates are within ${Math.round(delta)} day(s).`,
      );
    }
  }
}

function confidenceBand(score: number): DuplicateConfidenceBand {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function compareDuplicateFingerprints(
  source: DuplicateFingerprint,
  candidate: DuplicateFingerprint,
): DuplicateMatchResult {
  const factors: DuplicateMatchedFactor[] = [];
  identityFactors(source, candidate, factors);
  patientFactors(source, candidate, factors);
  reporterFactors(source, candidate, factors);
  productFactors(source, candidate, factors);
  eventFactors(source, candidate, factors);

  const uniqueFactors = Array.from(
    new Map(
      factors.map((factor) => [
        `${factor.key}:${factor.evidence}`,
        factor,
      ]),
    ).values(),
  );
  const rawScore = uniqueFactors.reduce(
    (sum, factor) => sum + factor.weight,
    0,
  );
  const score = Math.min(100, Math.round(rawScore * 100) / 100);

  return {
    candidate,
    score,
    confidenceBand: confidenceBand(score),
    matchedFactors: uniqueFactors,
  };
}

export function rankDuplicateCandidates(
  source: DuplicateFingerprint,
  candidates: DuplicateFingerprint[],
  options?: {
    threshold?: number;
    limit?: number;
  },
): DuplicateMatchResult[] {
  const threshold = options?.threshold ?? DUPLICATE_CANDIDATE_THRESHOLD;
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 50));

  return candidates
    .filter((candidate) => candidate.intakeRecordId !== source.intakeRecordId)
    .map((candidate) => compareDuplicateFingerprints(source, candidate))
    .filter((result) => result.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
