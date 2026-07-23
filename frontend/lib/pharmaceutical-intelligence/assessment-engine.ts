import {
  APPROVED_PHARMACEUTICAL_SCENARIOS,
  COMMON_SALT_TOKENS,
  DISTINCT_SALT_RELATIONSHIPS,
  DISTINCT_SUBSTANCE_GROUPS,
  EQUIVALENT_NAME_GROUPS,
  PHARMACEUTICAL_KNOWLEDGE_VERSION,
} from "./scenario-registry";
import type {
  CompanySuspectAssessment,
  PharmaceuticalRelationship,
  ProductDecisionStep,
  ProductMasterCandidate,
  SuspectProductEvidence,
} from "./types";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function scalar(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return "";
}

function list(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.map(String).map((item) => item.trim()).filter(Boolean);
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function records(payload: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && "records" in payload
      ? (payload as { records?: unknown }).records
      : [];
  return Array.isArray(candidate)
    ? candidate.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function canonicalIdentity(term: string): {
  canonical: string;
  relationship: PharmaceuticalRelationship;
  family?: string;
} {
  const normalized = normalize(term);
  for (const group of EQUIVALENT_NAME_GROUPS) {
    if (group.terms.some((item) => normalize(item) === normalized)) {
      return {
        canonical: normalize(group.canonical),
        relationship:
          normalized === normalize(group.canonical) ? "EXACT_NAME" : "EQUIVALENT_NAME",
      };
    }
  }
  for (const substance of DISTINCT_SUBSTANCE_GROUPS) {
    if (substance.terms.some((item) => normalize(item) === normalized)) {
      return {
        canonical: normalize(substance.canonical),
        relationship:
          normalized === normalize(substance.canonical) ? "EXACT_NAME" : "EQUIVALENT_NAME",
        family: normalize(substance.family),
      };
    }
  }
  if (DISTINCT_SUBSTANCE_GROUPS.some((item) => normalize(item.family) === normalized)) {
    return { canonical: normalized, relationship: "AMBIGUOUS_FAMILY_NAME", family: normalized };
  }
  return { canonical: normalized, relationship: normalized ? "EXACT_NAME" : "UNRESOLVED" };
}

function removeCommonSalt(term: string): { base: string; salt?: string } {
  const normalized = normalize(term);
  const distinct = DISTINCT_SALT_RELATIONSHIPS.find(
    (relationship) => normalize(relationship.reportedTerm) === normalized,
  );
  if (distinct) return { base: normalized };
  const ordered = [...COMMON_SALT_TOKENS].sort((a, b) => normalize(b).length - normalize(a).length);
  for (const token of ordered) {
    const salt = normalize(token);
    if (normalized === salt) continue;
    if (normalized.endsWith(` ${salt}`)) {
      return { base: normalized.slice(0, -(salt.length + 1)).trim(), salt: token };
    }
  }
  return { base: normalized };
}

function namesFor(record: Record<string, unknown>): string[] {
  return [
    scalar(record, ["brandName", "brand_name"]),
    scalar(record, ["genericName", "generic_name"]),
    scalar(record, ["inn", "INN"]),
    scalar(record, ["api", "API"]),
    scalar(record, ["composition", "activeComposition", "active_composition"]),
    ...list(record, ["synonyms", "productSynonyms"]),
    ...list(record, ["chemicalNames", "chemical_names"]),
    ...list(record, ["saltForms", "salts", "salt_forms"]),
  ].filter(Boolean);
}

function productCandidate(
  record: Record<string, unknown>,
  recordIndex: number,
  reportedCanonical: string,
): ProductMasterCandidate | null {
  for (const name of namesFor(record)) {
    const direct = canonicalIdentity(name);
    const withoutSalt = removeCommonSalt(name);
    const saltCanonical = canonicalIdentity(withoutSalt.base);
    if (direct.canonical === reportedCanonical || saltCanonical.canonical === reportedCanonical) {
      return {
        recordIndex,
        productId: scalar(record, ["clientProductId", "productId", "client_product_id", "product_id"]) || undefined,
        preferredName: namesFor(record)[0] || name,
        matchedName: name,
        relationship: direct.canonical === reportedCanonical ? direct.relationship : "COMMON_SALT_OF",
        dosageForm: scalar(record, ["dosageForm", "dosage_form"]) || undefined,
        formulation: scalar(record, ["formulation", "presentation", "productPresentation"]) || undefined,
        route: scalar(record, ["route", "approvedRoute", "approved_route"]) || undefined,
        country: scalar(record, ["country", "market", "coi"]) || undefined,
        mah: scalar(record, ["mah", "marketingAuthorizationHolder", "marketing_authorization_holder"]) || undefined,
        licenceEffectiveFrom: scalar(record, ["mahEffectiveFrom", "licenceEffectiveFrom", "effectiveFrom"]) || undefined,
        licenceEffectiveTo: scalar(record, ["mahEffectiveTo", "licenceEffectiveTo", "effectiveTo"]) || undefined,
        active: booleanValue(record.active ?? record.authorizationActive ?? record.licenceActive),
        sourceRecord: record,
      };
    }
  }
  return null;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = normalize(value);
  if (["true", "yes", "active", "1"].includes(normalized)) return true;
  if (["false", "no", "inactive", "expired", "withdrawn", "0"].includes(normalized)) return false;
  return undefined;
}

function presentationMatches(evidence: SuspectProductEvidence, candidate: ProductMasterCandidate): boolean | null {
  if (evidence.presentationQualifierRole !== "PRODUCT_PRESENTATION") return null;
  const reported = normalize(
    evidence.reportedFormulation || evidence.reportedDosageForm || evidence.reportedProduct,
  );
  const configured = normalize([candidate.formulation, candidate.dosageForm, candidate.route].filter(Boolean).join(" "));
  if (!configured) return false;
  const ivReported = /\b(iv|intravenous)\b/.test(reported);
  if (ivReported) return /\b(iv|intravenous|injection|infusion|parenteral)\b/.test(configured);
  const dosage = normalize(evidence.reportedDosageForm);
  return dosage ? configured.includes(dosage) : configured.includes(reported);
}

function dateWithin(date: string, from?: string, to?: string): boolean | null {
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return null;
  const fromTime = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toTime = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  if ((from && !Number.isFinite(fromTime)) || (to && !Number.isFinite(toTime))) return null;
  return timestamp >= fromTime && timestamp <= toTime;
}

function licenceStatus(
  candidate: ProductMasterCandidate,
  coi?: string,
  relevantDate?: string,
): "ACTIVE" | "INACTIVE" | "NOT_CONFIGURED" | "UNRESOLVED" {
  if (!coi) return "UNRESOLVED";
  if (!candidate.country) return "NOT_CONFIGURED";
  if (normalize(candidate.country) !== normalize(coi)) return "INACTIVE";
  if (candidate.active === false) return "INACTIVE";
  if (relevantDate && (candidate.licenceEffectiveFrom || candidate.licenceEffectiveTo)) {
    const valid = dateWithin(relevantDate, candidate.licenceEffectiveFrom, candidate.licenceEffectiveTo);
    if (valid === null) return "UNRESOLVED";
    return valid ? "ACTIVE" : "INACTIVE";
  }
  if (candidate.active === true) return "ACTIVE";
  if (candidate.licenceEffectiveFrom || candidate.licenceEffectiveTo) return "UNRESOLVED";
  return "NOT_CONFIGURED";
}

function scenario(ids: string[]) {
  const selected = APPROVED_PHARMACEUTICAL_SCENARIOS.filter((item) => ids.includes(item.id));
  return {
    prohibited: [...new Set(selected.flatMap((item) => item.prohibitedConclusions))],
  };
}

function trailStep(
  sequence: number,
  code: string,
  outcome: ProductDecisionStep["outcome"],
  explanation: string,
  scenarioIds: string[],
  evidence?: Record<string, unknown>,
): ProductDecisionStep {
  return { sequence, code, outcome, explanation, evidence, scenarioIds };
}

export function assessCompanySuspect(input: {
  evidence: SuspectProductEvidence;
  productMaster: unknown;
}): CompanySuspectAssessment {
  const { evidence } = input;
  const applied = new Set<string>();
  const decisionTrail: ProductDecisionStep[] = [];
  const reportedRole = evidence.role ?? "SUSPECT";
  const roleSupportsSuspicion = reportedRole === "SUSPECT"
    ? true
    : ["CONCOMITANT", "TREATMENT", "EXPOSURE", "PRODUCT_MENTION"].includes(reportedRole)
      ? false
      : null;
  if (evidence.conflictingEvidence?.length) {
    const appliedScenarioIds = ["P1-SCN-010"];
    return unresolvedAssessment(evidence, reportedRole, roleSupportsSuspicion, appliedScenarioIds, "Conflicting product evidence requires manual review.");
  }
  if (!evidence.reportedProduct.trim()) {
    const appliedScenarioIds = ["P1-SCN-012"];
    return unresolvedAssessment(evidence, reportedRole, roleSupportsSuspicion, appliedScenarioIds, "No identifiable suspect product was reported.", false);
  }
  if (roleSupportsSuspicion === false) {
    const appliedScenarioIds = [reportedRole === "PRODUCT_MENTION" || reportedRole === "EXPOSURE" ? "P1-SCN-008" : "P1-SCN-006"];
    return unresolvedAssessment(evidence, reportedRole, false, appliedScenarioIds, `The product was reported as ${reportedRole}, not as a suspect.`, false);
  }
  if (roleSupportsSuspicion === null) {
    return unresolvedAssessment(evidence, reportedRole, null, ["P1-SCN-006"], "The reported product role is unresolved.");
  }
  const reportedTerm = evidence.reportedComposition || evidence.reportedChemicalName || evidence.reportedProduct;
  const identitySource = productIdentityTerm(reportedTerm, evidence);
  const saltResolution = removeCommonSalt(identitySource);
  if (saltResolution.salt) applied.add("PPI-SCN-002");
  const identity = canonicalIdentity(saltResolution.base);
  applied.add("PPI-SCN-001");

  if (identity.relationship === "AMBIGUOUS_FAMILY_NAME") {
    applied.add("PPI-SCN-003");
    decisionTrail.push(trailStep(1, "AMBIGUOUS_PRODUCT_FAMILY", "REVIEW", "The reported family name does not establish a specific composition.", ["PPI-SCN-003"], { reportedTerm }));
    const appliedScenarioIds = [...applied];
    return {
      assessmentId: assessmentId(evidence),
      knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
      reportedProduct: evidence.reportedProduct,
      normalizedProduct: identity.canonical,
      relationship: identity.relationship,
      candidates: [],
      productMatched: false,
      presentationMatched: null,
      countryOfInterest: evidence.countryOfInterest,
      licenceStatus: "UNRESOLVED",
      companySuspect: null,
      conclusion: "UNRESOLVED",
      specialSituationReviewRequired: false,
      manualReviewRequired: true,
      appliedScenarioIds,
      prohibitedConclusions: scenario(appliedScenarioIds).prohibited,
      decisionTrail,
      reportedRole,
      roleSupportsSuspicion,
      evidenceLocation: evidence.evidenceLocation,
    };
  }

  const candidates = records(input.productMaster)
    .map((record, index) => productCandidate(record, index, identity.canonical))
    .filter((candidate): candidate is ProductMasterCandidate => Boolean(candidate));
  decisionTrail.push(trailStep(1, "PHARMACEUTICAL_IDENTITY_RESOLVED", identity.canonical ? "PASS" : "REVIEW", `Reported product resolved to ${identity.canonical || "an unresolved identity"}.`, [...applied], { reportedTerm, preservedSalt: saltResolution.salt }));
  decisionTrail.push(trailStep(2, "PRODUCT_MASTER_CANDIDATES", candidates.length ? "PASS" : "FAIL", `${candidates.length} configured Product Master candidate(s) matched the governed product identity.`, ["PPI-SCN-001"]));

  if (!candidates.length) {
    const possibleSpellingMatch = records(input.productMaster).some((record) =>
      namesFor(record).some((name) => editDistance(normalize(name), identity.canonical) <= 2),
    );
    if (possibleSpellingMatch) {
      return unresolvedAssessment(evidence, reportedRole, true, ["P1-SCN-004"], "A possible spelling/OCR product candidate was found; similarity alone cannot confirm identity.");
    }
    const appliedScenarioIds = [...applied];
    return {
      assessmentId: assessmentId(evidence), knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
      reportedProduct: evidence.reportedProduct, normalizedProduct: identity.canonical,
      preservedSalt: saltResolution.salt, relationship: saltResolution.salt ? "COMMON_SALT_OF" : identity.relationship,
      candidates: [], productMatched: false, presentationMatched: null,
      countryOfInterest: evidence.countryOfInterest, licenceStatus: "NOT_CONFIGURED",
      companySuspect: false, conclusion: "NOT_COMPANY_PRODUCT",
      specialSituationReviewRequired: false, manualReviewRequired: false,
      appliedScenarioIds, prohibitedConclusions: scenario(appliedScenarioIds).prohibited, decisionTrail,
      reportedRole, roleSupportsSuspicion, evidenceLocation: evidence.evidenceLocation,
    };
  }

  const role = evidence.presentationQualifierRole ?? (
    evidence.reportedFormulation || evidence.reportedDosageForm || evidence.reportedAdministrationRoute
      ? "UNCLEAR"
      : "NOT_REPORTED"
  );
  if (role === "PRODUCT_PRESENTATION") applied.add("PPI-SCN-004");
  if (role === "ADMINISTRATION_CIRCUMSTANCE") applied.add("PPI-SCN-005");
  const evaluated = candidates.map((candidate) => ({ candidate, presentation: presentationMatches(evidence, candidate) }));
  const presentationCandidates = role === "PRODUCT_PRESENTATION"
    ? evaluated.filter((item) => item.presentation === true)
    : evaluated;
  const presentationMatched = role === "PRODUCT_PRESENTATION" ? presentationCandidates.length > 0 : null;
  decisionTrail.push(trailStep(3, "PRESENTATION_ROLE_ASSESSED", role === "UNCLEAR" ? "REVIEW" : "PASS", `The reported qualifier was classified as ${role}.`, role === "ADMINISTRATION_CIRCUMSTANCE" ? ["PPI-SCN-005"] : ["PPI-SCN-004"], { reportedDosageForm: evidence.reportedDosageForm, reportedFormulation: evidence.reportedFormulation, reportedAdministrationRoute: evidence.reportedAdministrationRoute }));

  if (role === "PRODUCT_PRESENTATION" && !presentationCandidates.length) {
    const appliedScenarioIds = [...applied];
    return {
      assessmentId: assessmentId(evidence), knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
      reportedProduct: evidence.reportedProduct, normalizedProduct: identity.canonical,
      preservedSalt: saltResolution.salt, relationship: saltResolution.salt ? "COMMON_SALT_OF" : identity.relationship,
      candidates, productMatched: true, presentationMatched: false,
      countryOfInterest: evidence.countryOfInterest, licenceStatus: "NOT_CONFIGURED",
      companySuspect: false, conclusion: "NOT_COMPANY_PRESENTATION",
      specialSituationReviewRequired: false, manualReviewRequired: false,
      appliedScenarioIds, prohibitedConclusions: scenario(appliedScenarioIds).prohibited, decisionTrail,
      reportedRole, roleSupportsSuspicion, evidenceLocation: evidence.evidenceLocation,
    };
  }

  applied.add("PPI-SCN-006");
  const licensed = presentationCandidates.map((item) => ({
    ...item,
    licence: licenceStatus(item.candidate, evidence.countryOfInterest, evidence.relevantDate),
  }));
  const active = licensed.find((item) => item.licence === "ACTIVE");
  const unresolvedLicence = licensed.some((item) => ["UNRESOLVED", "NOT_CONFIGURED"].includes(item.licence));
  const selectedCandidate = active?.candidate ?? licensed[0]?.candidate;
  const finalLicence = active ? "ACTIVE" : unresolvedLicence ? "UNRESOLVED" : "INACTIVE";
  decisionTrail.push(trailStep(4, "COI_LICENCE_ASSESSED", active ? "PASS" : unresolvedLicence ? "REVIEW" : "FAIL", active ? "An active licence was confirmed for the matched presentation in the supplied COI and relevant date." : unresolvedLicence ? "COI or licence evidence is insufficient for a controlled conclusion." : "No active licence matched the supplied COI and relevant date.", ["PPI-SCN-006"], { countryOfInterest: evidence.countryOfInterest, relevantDate: evidence.relevantDate }));
  const administrationMismatch = role === "ADMINISTRATION_CIRCUMSTANCE" && Boolean(evidence.reportedAdministrationRoute);
  const manualReviewRequired = role === "UNCLEAR" || unresolvedLicence || administrationMismatch;
  const appliedScenarioIds = [...applied];
  return {
    assessmentId: assessmentId(evidence), knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
    reportedProduct: evidence.reportedProduct, normalizedProduct: identity.canonical,
    preservedSalt: saltResolution.salt, relationship: saltResolution.salt ? "COMMON_SALT_OF" : identity.relationship,
    candidates, selectedCandidate, productMatched: true, presentationMatched,
    countryOfInterest: evidence.countryOfInterest, licenceStatus: finalLicence,
    companySuspect: active ? true : unresolvedLicence ? null : false,
    conclusion: active ? "CONFIRMED" : unresolvedLicence ? "UNRESOLVED" : "NO_ACTIVE_LICENCE_IN_COI",
    specialSituationReviewRequired: administrationMismatch,
    manualReviewRequired,
    appliedScenarioIds, prohibitedConclusions: scenario(appliedScenarioIds).prohibited, decisionTrail,
    reportedRole, roleSupportsSuspicion, evidenceLocation: evidence.evidenceLocation,
  };
}

export function assessCompanySuspects(input: {
  evidence: SuspectProductEvidence[];
  productMaster: unknown;
}): CompanySuspectAssessment[] {
  return input.evidence.map((evidence) => assessCompanySuspect({ evidence, productMaster: input.productMaster }));
}

function unresolvedAssessment(
  evidence: SuspectProductEvidence,
  reportedRole: CompanySuspectAssessment["reportedRole"],
  roleSupportsSuspicion: boolean | null,
  appliedScenarioIds: string[],
  explanation: string,
  manualReviewRequired = true,
): CompanySuspectAssessment {
  return {
    assessmentId: assessmentId(evidence), knowledgeVersion: PHARMACEUTICAL_KNOWLEDGE_VERSION,
    reportedProduct: evidence.reportedProduct || "NOT_IDENTIFIABLE", relationship: "UNRESOLVED",
    candidates: [], productMatched: false, presentationMatched: null,
    countryOfInterest: evidence.countryOfInterest, licenceStatus: "UNRESOLVED",
    companySuspect: false, conclusion: "UNRESOLVED", specialSituationReviewRequired: false,
    manualReviewRequired, appliedScenarioIds, prohibitedConclusions: [],
    decisionTrail: [trailStep(1, "PRODUCT_ROLE_OR_IDENTITY_UNRESOLVED", manualReviewRequired ? "REVIEW" : "FAIL", explanation, appliedScenarioIds)],
    reportedRole, roleSupportsSuspicion, evidenceLocation: evidence.evidenceLocation,
  };
}

function productIdentityTerm(term: string, evidence: SuspectProductEvidence): string {
  if (evidence.presentationQualifierRole !== "PRODUCT_PRESENTATION") return term;
  let result = normalize(term);
  const qualifiers = [evidence.reportedFormulation, evidence.reportedDosageForm]
    .map(normalize)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const qualifier of qualifiers) {
    if (result.endsWith(` ${qualifier}`)) {
      result = result.slice(0, -(qualifier.length + 1)).trim();
    }
  }
  if (/\s(iv|intravenous)$/.test(result)) {
    result = result.replace(/\s(iv|intravenous)$/, "").trim();
  }
  return result;
}

function assessmentId(evidence: SuspectProductEvidence): string {
  const input = [evidence.reportedProduct, evidence.reportedComposition, evidence.countryOfInterest, evidence.relevantDate]
    .filter(Boolean).join("|");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `ppi_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function editDistance(left: string, right: string): number {
  if (!left || !right) return Math.max(left.length, right.length);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
}
