/** Per-agent retrieval intent for existing approved Nexus controlled knowledge.
 * No client-specific documents are inferred from tenant-global retrieval:
 * client product ownership is looked up separately with workspace scope.
 */
export const NEXUS_AGENT_KB_PROFILES = {
  "AG01": "drug roles and company product ownership",
  "AG02": "adverse event identification and MedDRA coding",
  "AG03": "identifiable patient demographics and E2B patient fields",
  "AG04": "identifiable reporter and primary source",
  "AG05": "drug indication and therapeutic intent",
  "AG06": "patient medical history and concurrent conditions",
  "AG07": "laboratory results units reference ranges and abnormality",
  "AG08": "country of incidence and source evidence",
  "AG09": "regulatory clock start date and reporting timelines",
  "AG10": "medical translation language and source fidelity",
  "AG11": "seriousness criteria and Important Medical Events",
  "AG12": "listedness expectedness CCDS SmPC RSI labeling",
  "AG13": "drug adverse event causality WHO UMC CIOMS",
  "AG14": "dechallenge action taken clinical improvement",
  "AG15": "rechallenge reintroduction recurrence",
  "AG16": "adverse events of special interest and special situations",
  "AG17": "safety information drug event association",
  "AG18": "literature duplicate publications patient overlap",
  "AG19": "ICSR duplicate case and follow-up detection",
  "AG20": "ICSR medical narrative evidence and chronology",
  "AG21": "follow-up questionnaire missing case information",
  "AG22": "literature inclusion exclusion criteria",
  "AG23": "drug action taken and case outcome",
  "AG24": "historical medications and clinical history",
  "AG25": "ICSR four minimum criteria validity",
  "AG26": "intake triage urgency and classification",
  "AG27": "individual patient versus aggregate safety relevance"
} as const;

export type NexusAgentId = keyof typeof NEXUS_AGENT_KB_PROFILES;
export function isNexusAgentId(id: string): id is NexusAgentId {
  return Object.prototype.hasOwnProperty.call(NEXUS_AGENT_KB_PROFILES,id);
}
export function agentKnowledgeQuery(agentId: NexusAgentId, documentText: string): string {
  return "Pharmacovigilance controlled knowledge: " +
    NEXUS_AGENT_KB_PROFILES[agentId] +
    "\nSource evidence: " + documentText.slice(0, 18000);
}
