/** Shared, side-effect-free seriousness recommendation. Never a source-fact writer. */
export const SERIOUSNESS_CRITERIA = ["DEATH", "LIFE_THREATENING", "HOSPITALIZATION", "DISABILITY", "CONGENITAL_ANOMALY", "OTHER_MEDICALLY_IMPORTANT"] as const;
export type SeriousnessCriterion = typeof SERIOUSNESS_CRITERIA[number];
export type CriterionState = "TRUE" | "FALSE" | "UNRESOLVED" | "CONFLICTING";
export interface SeriousnessSource { id: string; text: string; sha256: string; }
export interface SeriousnessSpan { sourceId: string; start: number; end: number; quote: string; }
export interface SeriousnessFinding {
  criterion: SeriousnessCriterion; state: "TRUE" | "FALSE";
  patientId: string; eventId: string; evidence: SeriousnessSpan;
  attribution: "SUPPORTED" | "UNRESOLVED";
  origin: "NLP" | "REPORTER" | "REVIEWER";
}
export interface SeriousnessInput {
  tenantId: string; clientId: string; patientId: string; eventId: string;
  sources: SeriousnessSource[]; findings: SeriousnessFinding[];
  reporterAssessment?: "SERIOUS" | "NON_SERIOUS" | "UNRESOLVED";
  coverage: "FULL_TEXT" | "ABSTRACT_ONLY" | "TITLE_ONLY";
  knowledgePack: { id: string; version: string; tenantId: string; clientId: string;
    status: "DRAFT" | "APPROVED"; mandatoryRuleIds: string[]; sourceHashes: string[]; };
}
const REQUIRED_RULES = SERIOUSNESS_CRITERIA.map(c => `SER-${c}-001`);
const patterns: Record<SeriousnessCriterion, RegExp> = {
  DEATH: /\b(died|death|fatal|deceased)\b/gi,
  LIFE_THREATENING: /\b(life[- ]threatening|ICU|intubat\w*|resuscitat\w*|risk of death)\b/gi,
  HOSPITALIZATION: /\b(hospitali[sz]\w*|inpatient|admitted|admission|prolong\w* hospital\w*)\b/gi,
  DISABILITY: /\b(disabil\w*|incapacit\w*|permanent impairment)\b/gi,
  CONGENITAL_ANOMALY: /\b(congenital anomal\w*|birth defect\w*|congenital malformation\w*)\b/gi,
  OTHER_MEDICALLY_IMPORTANT: /\b(medically important|anaphylaxis|Stevens[- ]Johnson|toxic epidermal necrolysis|epinephrine|convulsion\w*|agranulocytosis)\b/gi,
};
export interface SeriousnessCandidate { criterion: SeriousnessCriterion; evidence: SeriousnessSpan;
  contextFlags: string[]; interpretation: "CANDIDATE_ONLY"; }
/** Lexical NLP with sentence context. Recall aid; neither an IME list nor clinical inference. */
export function extractSeriousnessCandidates(source: SeriousnessSource): SeriousnessCandidate[] {
  const candidates: SeriousnessCandidate[] = [];
  for (const sentence of source.text.matchAll(/[^.!?\n]+(?:[.!?]+|$)/g)) {
    const quote = sentence[0]; const start = sentence.index!;
    for (const criterion of SERIOUSNESS_CRITERIA) {
      patterns[criterion].lastIndex = 0;
      if (!patterns[criterion].test(quote)) continue;
      const contextFlags: string[] = [];
      if (/\b(no|not|never|denies|without|ruled out)\b/i.test(quote)) contextFlags.push("NEGATION_REQUIRES_SCOPE_REVIEW");
      if (/\b(history|previous|prior|formerly|years ago)\b/i.test(quote)) contextFlags.push("HISTORICAL_CONTEXT");
      if (/\b(mother|father|sibling|family|other patient)\b/i.test(quote)) contextFlags.push("SUBJECT_ATTRIBUTION_REQUIRED");
      if (/\b(planned|elective|observation|outpatient|emergency department)\b/i.test(quote)) contextFlags.push("CARE_SETTING_REVIEW");
      if (/\b(may|might|could|risk|hypothetical|if)\b/i.test(quote)) contextFlags.push("HYPOTHETICAL_CONTEXT");
      candidates.push({criterion, evidence: {sourceId: source.id, start, end: start + quote.length, quote}, contextFlags, interpretation: "CANDIDATE_ONLY"});
    }
  }
  return candidates;
}
export function assessSeriousness(input: SeriousnessInput) {
  if (![input.tenantId,input.clientId,input.patientId,input.eventId].every(v => typeof v === "string" && v.trim())) throw new Error("Explicit tenant, client, patient and event scope required");
  if (input.knowledgePack.tenantId !== input.tenantId || input.knowledgePack.clientId !== input.clientId) throw new Error("Knowledge pack scope mismatch");
  const ids = new Set<string>();
  for (const source of input.sources) {
    if (!source.id || ids.has(source.id) || !/^[a-f0-9]{64}$/i.test(source.sha256)) throw new Error("Unique sources and SHA-256 provenance required");
    ids.add(source.id);
  }
  const rejectedFindings: {index: number; reason: string}[] = [];
  const accepted: SeriousnessFinding[] = [];
  input.findings.forEach((f,index) => {
    const source = input.sources.find(s => s.id === f.evidence?.sourceId);
    const e = f.evidence;
    if (!SERIOUSNESS_CRITERIA.includes(f.criterion) || !["TRUE","FALSE"].includes(f.state) || !["NLP","REPORTER","REVIEWER"].includes(f.origin)) { rejectedFindings.push({index,reason:"INVALID_FINDING"}); return; }
    if (f.patientId !== input.patientId || f.eventId !== input.eventId || f.attribution !== "SUPPORTED") { rejectedFindings.push({index,reason:"UNSUPPORTED_PATIENT_EVENT_ATTRIBUTION"}); return; }
    if (!source || !e || !Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end <= e.start || e.end > source.text.length || !e.quote.trim() || source.text.slice(e.start,e.end) !== e.quote) { rejectedFindings.push({index,reason:"INVALID_SOURCE_SPAN"}); return; }
    accepted.push(f);
  });
  const criteria = SERIOUSNESS_CRITERIA.map(criterion => {
    const findings = accepted.filter(f => f.criterion === criterion);
    const positive = findings.some(f => f.state === "TRUE");
    const negative = findings.some(f => f.state === "FALSE");
    const state: CriterionState = positive && negative ? "CONFLICTING" : positive ? "TRUE" : negative ? "FALSE" : "UNRESOLVED";
    return {criterion,state,findings};
  });
  const candidates = input.sources.flatMap(extractSeriousnessCandidates);
  const unmappedCandidates = candidates.filter(c => !accepted.some(f => f.criterion === c.criterion && f.evidence.sourceId === c.evidence.sourceId && f.evidence.start <= c.evidence.start && f.evidence.end >= c.evidence.end));
  const knowledgeGaps = REQUIRED_RULES.filter(id => !input.knowledgePack.mandatoryRuleIds.includes(id));
  if (input.knowledgePack.status !== "APPROVED") knowledgeGaps.push("APPROVED_KNOWLEDGE_PACK_REQUIRED");
  if (!input.knowledgePack.sourceHashes.length || input.knowledgePack.sourceHashes.some(h => !/^[a-f0-9]{64}$/i.test(h))) knowledgeGaps.push("RULE_SOURCE_PROVENANCE_REQUIRED");
  const positive = criteria.some(c => c.state === "TRUE" || c.state === "CONFLICTING");
  const allNegative = criteria.every(c => c.state === "FALSE");
  const conflict = criteria.some(c => c.state === "CONFLICTING") || (input.reporterAssessment === "NON_SERIOUS" && positive) || (input.reporterAssessment === "SERIOUS" && allNegative);
  const recommendation = positive || input.reporterAssessment === "SERIOUS" ? "SERIOUS" : allNegative && !unmappedCandidates.length && !rejectedFindings.length && input.coverage === "FULL_TEXT" ? "NON_SERIOUS" : "UNRESOLVED";
  // Independent clinical validation, licensed references and production workflow gates remain open.
  return {engineVersion:"0.1.0", tenantId:input.tenantId, clientId:input.clientId, patientId:input.patientId, eventId:input.eventId,
    recommendation, criteria, candidates, rejectedFindings, conflict, knowledgeGaps,
    reporterAssessment:input.reporterAssessment ?? "UNRESOLVED", manualReviewRequired:true, effectiveForProduction:false,
    knowledgePack:{id:input.knowledgePack.id,version:input.knowledgePack.version}, sourceHashes:input.sources.map(s=>({sourceId:s.id,sha256:s.sha256})),
    appliedRuleIds:REQUIRED_RULES.filter(id=>input.knowledgePack.mandatoryRuleIds.includes(id)),
    inferenceIsSourceFact:false, calibratedConfidence:null};
}

export interface SeriousnessNlpExtractor {
  modelId: string;
  promptVersion: string;
  extract(input: Pick<SeriousnessInput, "sources" | "patientId" | "eventId">): Promise<SeriousnessFinding[]>;
}
/** Provider-neutral semantic NLP adapter. Provider failure always preserves review routing. */
export async function assessSeriousnessWithNlp(input: SeriousnessInput, extractor: SeriousnessNlpExtractor) {
  // Validate scope before any source text is sent to a provider.
  assessSeriousness(input);
  if (!extractor.modelId.trim() || !extractor.promptVersion.trim()) throw new Error("Versioned NLP extractor required");
  try {
    const extracted = await extractor.extract({sources:input.sources, patientId:input.patientId, eventId:input.eventId});
    if (!Array.isArray(extracted) || extracted.some(f => !f || typeof f !== "object")) throw new Error("Invalid extraction response");
    const findings = extracted.map(f => ({...f, origin:"NLP" as const}));
    return {...assessSeriousness({...input,findings:[...input.findings,...findings]}),nlp:{modelId:extractor.modelId,promptVersion:extractor.promptVersion,status:"COMPLETED"}};
  } catch {
    return {...assessSeriousness(input),nlp:{modelId:extractor.modelId,promptVersion:extractor.promptVersion,status:"FAILED_REVIEW_REQUIRED"}};
  }
}
