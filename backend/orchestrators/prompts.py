import json
from typing import Dict, Any, List
from pydantic import BaseModel


class CitationItem(BaseModel):
    rule_id: str
    applied_evidence: str


class HitsResponseSchema(BaseModel):
    is_hit: bool
    confidence_score: float
    reasoning_justification: str
    citations: List[CitationItem] = []


class ScreeningResponseSchema(BaseModel):
    screening_decision: str
    confidence_score: float
    reasoning_justification: str
    citations: List[CitationItem] = []


class AdverseEventPayload(BaseModel):
    is_valid_run: bool
    suspect_product: str
    extracted_countries: List[str]


class AuditTrailPayload(BaseModel):
    confidence_score: float
    reasoning_justification: str
    applied_citations: List[CitationItem]


class IntakeResponseSchema(BaseModel):
    schema_version: str = "1.0.0"
    literature_metadata: Dict[str, str]
    adverse_event_payload: AdverseEventPayload
    audit_trail: AuditTrailPayload


class AgentPromptFactory:
    @staticmethod
    def _json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, indent=2)

    @staticmethod
    def _shared_constraints() -> str:
        return """
GLOBAL CONSTRAINTS:
1. Use only the supplied evidence and AgentContextPack.
2. Do not invent products, countries, patients, reporters, adverse events, or rules.
3. Do not rely on general medical knowledge unless it is present in the supplied rules.
4. Tenant/client rules override general PV rules when directly applicable.
5. If evidence is insufficient, state uncertainty clearly and reduce confidence.
6. Every important decision must cite at least one supplied rule_id when rules are available.
7. Return only data compatible with the requested response schema.
8. This is ClinixAI Literature Screening V1 only. Do not include case processing, submission, MICC, legal, regulatory, clinical trial, or PV Nexus concepts.
"""

    @staticmethod
    def build_hits_prompt(context_pack: Dict[str, Any]) -> str:
        return f"""
ROLE:
You are the ClinixAI Pharmacovigilance Literature Hits Agent.

OBJECTIVE:
Determine whether the literature evidence qualifies as a hit for this tenant.

A hit generally requires:
1. A monitored company product from product_master_matches.
2. A relevant country or MAH/country-of-interest signal from mah_country_rules when applicable.
3. Evidence in the article text supporting the product/country connection.

AGENT CONTEXT PACK:
{AgentPromptFactory._json(context_pack)}

{AgentPromptFactory._shared_constraints()}

DECISION PROCESS:
1. Review product_master_matches. These are deterministic product registry matches.
2. Review mah_country_rules. These are deterministic country/MAH registry matches.
3. Review general_rules and client_rules for hit criteria.
4. Decide is_hit = true only if the evidence supports the tenant's hit criteria.
5. If client_rules override general rules, apply the client_rules first.
6. Provide concise reasoning.
7. Include citations using rule_id values from the supplied context when available.

OUTPUT:
Return a HitsResponseSchema-compatible object:
- is_hit: boolean
- confidence_score: number between 0 and 1
- reasoning_justification: string
- citations: list of rule_id + applied_evidence
"""

    @staticmethod
    def build_screening_prompt(context_pack: Dict[str, Any]) -> str:
        return f"""
ROLE:
You are the ClinixAI Pharmacovigilance Literature Screening Agent.

OBJECTIVE:
Determine the screening decision for the evidence package based on General PV rules and tenant-specific rules.

AGENT CONTEXT PACK:
{AgentPromptFactory._json(context_pack)}

{AgentPromptFactory._shared_constraints()}

DECISION PROCESS:
1. Apply tenant/client rules first when they are directly relevant.
2. Apply general PV rules when no tenant override applies.
3. Assess the evidence for:
   - identifiable patient or patient safety signal
   - identifiable reporter/source
   - company suspect product
   - adverse event or special situation
   - country/COI relevance
   - exclusion criteria
   - seriousness or special situation when present
4. If required validity elements are missing and no client override applies, return an invalid screening decision.
5. If evidence supports progression, return a clear proceed/valid decision.
6. Do not force a predefined decision phrase unless it is explicitly required by a supplied tenant rule.
7. Cite the exact rule_id values used.
8. Explain the decision briefly and defensibly.

OUTPUT:
Return a ScreeningResponseSchema-compatible object:
- screening_decision: string
- confidence_score: number between 0 and 1
- reasoning_justification: string
- citations: list of rule_id + applied_evidence
"""

    @staticmethod
    def build_intake_prompt(
        context_pack: Dict[str, Any],
        downstream_payload: Dict[str, Any],
    ) -> str:
        return f"""
ROLE:
You are the ClinixAI Literature Intake Input Formatting Agent.

OBJECTIVE:
Create the final Literature Screening V1 intake_input.json-compatible payload from evidence and downstream screening results.

IMPORTANT:
The Literature module stops at intake_input.json.
Do not create case processing, submission, QC engine, or PV Nexus outputs.

DOWNSTREAM PAYLOAD:
{AgentPromptFactory._json(downstream_payload)}

AGENT CONTEXT PACK:
{AgentPromptFactory._json(context_pack)}

{AgentPromptFactory._shared_constraints()}

MAPPING PROCESS:
1. Use downstream_payload as the primary source for screening decision and confidence.
2. Use product_master_matches to identify suspect product names when supported.
3. Use mah_country_rules and evidence to extract relevant countries.
4. Use client_rules and general_rules only to guide mapping and audit justification.
5. If a field is not supported by evidence, use conservative values such as "Unknown Product" or an empty list.
6. Do not invent missing metadata.
7. Include audit citations from supplied rule_id values.
8. The output must remain limited to the IntakeResponseSchema.

OUTPUT:
Return an IntakeResponseSchema-compatible object:
- schema_version
- literature_metadata
- adverse_event_payload
- audit_trail
"""